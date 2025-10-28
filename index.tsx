/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { classes } from "@utils/misc";
import { findComponentByCodeLazy, findByPropsLazy } from "@webpack";
import {
    ChannelStore,
    Menu,
    PermissionsBits,
    PermissionStore,
    React,
    Toasts,
    UserStore
} from "@webpack/common";
import type { PropsWithChildren, SVGProps } from "react";
import type { Channel, User } from "@vencord/discord-types";

interface IconProps extends SVGProps<SVGSVGElement> {
    className?: string;
    height?: string | number;
    width?: string | number;
}

interface BaseIconProps extends IconProps {
    viewBox: string;
}

function Icon({ height = 24, width = 24, className, children, viewBox, ...svgProps }: PropsWithChildren<BaseIconProps>) {
    return (
        <svg className={classes(className, "vc-icon")} role="img" width={width} height={height} viewBox={viewBox} {...svgProps}>
            {children}
        </svg>
    );
}

function FollowIcon(props: IconProps) {
    return (
        <Icon {...props} viewBox="0 -960 960 960">
            <path fill="currentColor" d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
        </Icon>
    );
}

interface VoiceState {
    userId: string;
    channelId?: string;
    oldChannelId?: string;
    mute?: boolean;
    deaf?: boolean;
}

export const settings = definePluginSettings({
    disconnectUserId: { type: OptionType.STRING, hidden: true, default: "" },
    muteUserId: { type: OptionType.STRING, hidden: true, default: "" },
    deafenUserId: { type: OptionType.STRING, hidden: true, default: "" }
});

const Auth: { getToken: () => string } = findByPropsLazy("getToken");

async function patchGuildMember(guildId: string, userId: string, body: any, successMsg: string) {
    const token = Auth?.getToken?.();
    if (!token) {
        Toasts.show({ message: "Auth token alınamadı", type: Toasts.Type.FAILURE, id: Toasts.genId() });
        return;
    }

    try {
        const response = await fetch(`/api/v9/guilds/${guildId}/members/${userId}`, {
            method: "PATCH",
            headers: { "Authorization": token, "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        if (response.ok)
            Toasts.show({ message: successMsg, type: Toasts.Type.SUCCESS, id: Toasts.genId() });
        else
            Toasts.show({ message: `İşlem başarısız (${response.status})`, type: Toasts.Type.FAILURE, id: Toasts.genId() });
    } catch {
        Toasts.show({ message: "Ağ hatası oluştu", type: Toasts.Type.FAILURE, id: Toasts.genId() });
    }
}

const UserContext: NavContextMenuPatchCallback = (children, { user }: { user: User }) => {
    if (!user || user.id === UserStore.getCurrentUser().id) return;

    const items = [
        { id: "disconnect", label: "🔌 Bağlantıyı Kes", key: "disconnectUserId" },
        { id: "mute", label: "🔇 Sustur", key: "muteUserId" },
        { id: "deafen", label: "🎧 Kulaklığı Kapat", key: "deafenUserId" },
    ];

    children.splice(-1, 0, (
        <Menu.MenuGroup key="voice-control-group">
            {items.map(({ id, label, key }) => {
                const active = settings.store[key] === user.id;
                return (
                    <Menu.MenuItem
                        id={id}
                        label={label + (active ? " (aktif)" : "")}
                        action={() => settings.store[key] = active ? "" : user.id}
                        icon={FollowIcon}
                    />
                );
            })}
        </Menu.MenuGroup>
    ));
};

export default definePlugin({
    name: "VoiceControlPlus",
    description: "Kullanıcıyı otomatik susturur, kulaklığını kapatır veya bağlantısını keser.",
    authors: [{ id: 1242811215110082584n, name: "Jeasus" }, { name: "emirvaki", id: 1357545010848989247n }],
    settings,
    contextMenus: { "user-context": UserContext },
    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[] }) {
            for (const state of voiceStates) {
                const { userId, channelId, oldChannelId, mute, deaf } = state;

                const channel = channelId ? ChannelStore.getChannel(channelId) : null;
                const guildId = (channel as any)?.guild_id ?? (channel as any)?.guildId;
                if (!guildId) continue;
                if (!PermissionStore.can(PermissionsBits.MOVE_MEMBERS, channel)) continue;

                // Kanal değişikliği (Disconnect)
                if (settings.store.disconnectUserId === userId && channelId)
                    void patchGuildMember(guildId, userId, { channel_id: null }, "Kullanıcı bağlantıdan atıldı");

                // Mute kontrolü
                if (settings.store.muteUserId === userId && mute === false)
                    void patchGuildMember(guildId, userId, { mute: true }, "Kullanıcı susturuldu");

                // Deafen kontrolü
                if (settings.store.deafenUserId === userId && deaf === false)
                    void patchGuildMember(guildId, userId, { deaf: true }, "Kullanıcının kulaklığı kapatıldı");
            }
        }
    }
});
