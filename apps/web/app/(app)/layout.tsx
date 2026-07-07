"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Avatar from "@/components/avatar";
import { getSocket } from "@/lib/socket";
import {
  armSoundOnFirstGesture,
  playMentionChime,
  playMessageChime,
} from "@/lib/sound";
import { api } from "@/lib/api";
import type { Me } from "@/lib/types";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}

const NAV = [
  { href: "/chats", label: "Inbox", icon: ChatIcon },
  { href: "/tasks", label: "Tasks", icon: TaskIcon },
  { href: "/incidents", label: "Incidents", icon: AlertIcon },
  { href: "/saved", label: "Saved", icon: BookmarkIcon },
  { href: "/directory", label: "Directory", icon: PeopleIcon },
  { href: "/admin", label: "Admin", icon: ShieldIcon, adminOnly: true },
];

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();
  const { data: me } = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => api.get("/me"),
  });

  // App-wide notification sounds. Message chime: someone else posted in one
  // of your conversations and you're not currently reading it (or the tab is
  // in the background). Mention chime: you were @mentioned (server already
  // suppresses these for muted conversations).
  useEffect(() => {
    if (!me) return;
    armSoundOnFirstGesture();
    import("@/lib/push").then((m) => m.registerServiceWorker());
    const socket = getSocket();

    const onConversationUpdated = (p: {
      conversationId: string;
      senderId?: string;
      kind?: string;
    }) => {
      if (p.kind !== "message" || !p.senderId || p.senderId === me.id) return;
      const viewingIt =
        !document.hidden &&
        window.location.pathname.startsWith("/chats") &&
        new URLSearchParams(window.location.search).get("c") ===
          p.conversationId;
      if (viewingIt) return;
      // Respect per-conversation mute using the cached sidebar data.
      const list = queryClient.getQueryData<
        { id: string; mutedUntil: string | null }[]
      >(["conversations"]);
      const convo = list?.find(
        (c: { id: string }) => c.id === p.conversationId,
      );
      if (convo?.mutedUntil) return;
      playMessageChime();
    };

    const onNotification = (n: { kind?: string }) => {
      if (n.kind === "mention" || n.kind === "incident") playMentionChime();
      else if (n.kind === "task") playMessageChime();
    };

    socket.on("conversation.updated", onConversationUpdated);
    socket.on("notification.new", onNotification);
    return () => {
      socket.off("conversation.updated", onConversationUpdated);
      socket.off("notification.new", onNotification);
    };
  }, [me, queryClient]);
  const isAdmin = me?.role === "ADMIN" || me?.role === "SUPER_ADMIN";

  async function logout() {
    try {
      await api.post("/auth/logout");
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <div className="flex h-screen">
      {/* Nav rail (desktop) */}
      <nav
        className={`hidden flex-col border-r border-line bg-surface py-4 md:flex ${
          expanded ? "w-52 items-stretch px-3" : "w-16 items-center"
        }`}
      >
        <Link
          href="/chats"
          aria-label="iWarehouse Messenger home"
          className={`mb-6 flex items-center gap-2 text-ink ${expanded ? "px-1" : ""}`}
        >
          <RailLogo />
          {expanded && (
            <span className="text-sm font-semibold tracking-tight">
              iWarehouse
            </span>
          )}
        </Link>
        <div
          className={`flex flex-1 flex-col gap-1 ${expanded ? "" : "items-center"}`}
        >
          {NAV.filter((n) => !n.adminOnly || isAdmin).map((n) => {
            const active = pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-label={n.label}
                title={n.label}
                className={`relative flex h-11 items-center rounded-md ${
                  expanded ? "w-full gap-3 px-3" : "w-11 justify-center"
                } ${active ? "bg-accent/10 text-accent" : "text-soft hover:bg-raised hover:text-ink"}`}
              >
                {active && (
                  <span
                    className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-accent"
                    aria-hidden
                  />
                )}
                <n.icon />
                {expanded && (
                  <span className="text-sm font-medium">{n.label}</span>
                )}
              </Link>
            );
          })}
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Collapse menu" : "Expand menu"}
          aria-label={expanded ? "Collapse menu" : "Expand menu"}
          className={`mb-1 flex h-9 items-center rounded-md text-soft hover:bg-raised hover:text-ink ${
            expanded ? "w-full gap-3 px-3" : "w-11 justify-center"
          }`}
        >
          <ChevronIcon flip={expanded} />
          {expanded && <span className="text-xs">Collapse</span>}
        </button>
        <ThemeToggle />
        <button
          onClick={logout}
          title="Sign out"
          aria-label="Sign out"
          className="mt-2 flex h-11 w-11 items-center justify-center rounded-md text-soft hover:bg-raised hover:text-ink"
        >
          <ExitIcon />
        </button>
        <Link
          href="/profile"
          className={`mt-3 flex items-center rounded-full ${
            expanded ? "w-full gap-2 px-2 py-1.5 hover:bg-raised" : ""
          }`}
          title="Your profile"
        >
          <RailAvatar
            userId={me?.id}
            name={me?.profile?.displayName ?? me?.username ?? "?"}
            avatarKey={me?.profile?.avatarKey}
          />
          {expanded && (
            <span className="min-w-0 flex-1 truncate text-xs font-medium">
              {me?.profile?.displayName ?? me?.username}
            </span>
          )}
        </Link>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">{children}</div>

        {/* Bottom navigation (mobile) */}
        <nav className="flex border-t border-line bg-surface md:hidden">
          {NAV.filter((n) => !n.adminOnly || isAdmin).map((n) => {
            const active = pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
                  active ? "text-accent" : "text-soft"
                }`}
              >
                <n.icon />
                {n.label}
              </Link>
            );
          })}
          <Link
            href="/profile"
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
              pathname.startsWith("/profile") ? "text-accent" : "text-soft"
            }`}
          >
            <ProfileIcon />
            Profile
          </Link>
          <button
            onClick={logout}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-soft"
          >
            <ExitIcon />
            Sign out
          </button>
        </nav>
      </div>
    </div>
  );
}

function ProfileIcon() {
  return (
    <svg {...s} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1-3.5 4-5 7-5s6 1.5 7 5" strokeLinecap="round" />
    </svg>
  );
}
function RailAvatar({
  userId,
  name,
  avatarKey,
}: {
  userId?: string | null;
  name: string;
  avatarKey?: string | null;
}) {
  return <Avatar userId={userId} name={name} avatarKey={avatarKey} size="md" />;
}
function ChevronIcon({ flip }: { flip: boolean }) {
  return (
    <svg
      {...s}
      viewBox="0 0 24 24"
      aria-hidden
      style={{ transform: flip ? "rotate(180deg)" : "none" }}
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ThemeToggle() {
  const [dark, setDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("iwm-theme", next ? "dark" : "light");
  }
  return (
    <button
      onClick={toggle}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
      className="flex h-11 w-11 items-center justify-center rounded-md text-soft hover:bg-raised hover:text-ink"
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/* Inline icons keep Phase 1 dependency-free. */
const s = {
  width: 20,
  height: 20,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
} as const;
function RailLogo() {
  return (
    <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden>
      <rect
        x="1"
        y="7"
        width="26"
        height="20"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M1 12h26" stroke="currentColor" strokeWidth="2" />
      <path
        d="M4 7l10-5 10 5"
        fill="none"
        stroke="rgb(232 111 30)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect x="11" y="17" width="6" height="6" fill="rgb(232 111 30)" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg {...s} viewBox="0 0 24 24" aria-hidden>
      <path d="M4 5h16v11H8l-4 4V5z" strokeLinejoin="round" />
    </svg>
  );
}
function PeopleIcon() {
  return (
    <svg {...s} viewBox="0 0 24 24" aria-hidden>
      <circle cx="9" cy="8" r="3.2" />
      <path
        d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5"
        strokeLinecap="round"
      />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M16 14.7c2 .2 3.6 1.5 4.3 3.8" strokeLinecap="round" />
    </svg>
  );
}
function TaskIcon() {
  return (
    <svg {...s} viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 12l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function AlertIcon() {
  return (
    <svg {...s} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3l10 18H2L12 3z" strokeLinejoin="round" />
      <path d="M12 10v5" strokeLinecap="round" />
      <path d="M12 18h.01" strokeLinecap="round" />
    </svg>
  );
}
function BookmarkIcon() {
  return (
    <svg {...s} viewBox="0 0 24 24" aria-hidden>
      <path d="M7 4h10v16l-5-4-5 4V4z" strokeLinejoin="round" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg {...s} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ExitIcon() {
  return (
    <svg {...s} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M14 4H6v16h8M10 12h11m0 0l-3-3m3 3l-3 3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg {...s} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg {...s} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2v3M12 19v3M2 12h3M19 12h3M4.5 4.5l2 2M17.5 17.5l2 2M19.5 4.5l-2 2M6.5 17.5l-2 2"
        strokeLinecap="round"
      />
    </svg>
  );
}
