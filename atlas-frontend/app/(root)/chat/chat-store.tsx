"use client";

import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import type { ChatAction, ChatState, ID } from "./types";

const bc = typeof window !== "undefined" ? new BroadcastChannel("brainiacs-chat") : null;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const initialState: ChatState = {
  channels: [
    { id: "c-general", name: "general" },
    { id: "c-start", name: "start-here" },
    { id: "c-announce", name: "announcements" },
  ],
  activeChannelId: "c-general",
  messages: [
    {
      id: uid(),
      channelId: "c-general",
      author: "nat1",
      text: "Welcome to Brainiacs — use #general to coordinate!",
      ts: Date.now() - 600000,
    },
    {
      id: uid(),
      channelId: "c-general",
      author: "NeuroKat",
      text: "Just pushed the atlas viewer tweaks. Can someone QA the dual view?",
      ts: Date.now() - 540000,
    },
    {
      id: uid(),
      channelId: "c-general",
      author: "axon42",
      text: "I’ll test levels 27–30 and report back.",
      ts: Date.now() - 520000,
    },
  ],
  members: [
    { id: "m-nat", name: "nat1", online: true },
    { id: "m-kat", name: "NeuroKat", online: true },
    { id: "m-ax", name: "axon42", online: true },
    { id: "m-syn", name: "SynapseSam", online: true },
    { id: "m-gli", name: "glial_guru", online: false },
    { id: "m-ast", name: "astrobyte", online: false },
    { id: "m-mye", name: "myelin", online: false },
  ],
};

function reducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "SEND_MESSAGE": {
      const { channelId, author, text } = action.payload;
      const msg = { id: uid(), channelId, author, text, ts: Date.now() };
      return { ...state, messages: [...state.messages, msg] };
    }
    case "ADD_CHANNEL": {
      const ch = { id: `c-${uid()}`, name: action.payload.name };
      return { ...state, channels: [...state.channels, ch], activeChannelId: ch.id };
    }
    case "SWITCH_CHANNEL":
      return { ...state, activeChannelId: action.payload.channelId };
    case "SET_ONLINE": {
      const { memberId, online } = action.payload;
      return {
        ...state,
        members: state.members.map((m) => (m.id === memberId ? { ...m, online } : m)),
      };
    }
    case "START_TYPING": {
      const { memberId, channelId } = action.payload;
      return {
        ...state,
        members: state.members.map((m) => (m.id === memberId ? { ...m, typingIn: channelId } : m)),
      };
    }
    case "STOP_TYPING":
      return {
        ...state,
        members: state.members.map((m) =>
          m.id === action.payload.memberId ? { ...m, typingIn: null } : m
        ),
      };
    default:
      return state;
  }
}

const ChatCtx = createContext<{
  state: ChatState;
  dispatchRemote: (a: ChatAction) => void;
  meId: ID;
  meName: string;
} | null>(null);

export function ChatProvider({
  children,
  meId = "m-nat",
  meName = "nat1",
}: {
  children: React.ReactNode;
  meId?: ID;
  meName?: string;
}) {
  const [state, localDispatch] = useReducer(reducer, initialState);

  // Receive actions from other tabs
  useEffect(() => {
    if (!bc) return;
    const handler = (e: MessageEvent<ChatAction>) => {
      localDispatch(e.data);
    };
    bc.addEventListener("message", handler);
    return () => bc.removeEventListener("message", handler);
  }, []);

  // Send to local reducer + broadcast
  const dispatchRemote = (a: ChatAction) => {
    localDispatch(a);
    bc?.postMessage(a);
  };

  // Mark me online on focus/visibility change (toy presence)
  useEffect(() => {
    const toOnline = () =>
      dispatchRemote({ type: "SET_ONLINE", payload: { memberId: meId, online: true } });
    const toAway = () =>
      dispatchRemote({ type: "SET_ONLINE", payload: { memberId: meId, online: false } });
    toOnline();
    window.addEventListener("focus", toOnline);
    window.addEventListener("blur", toAway);
    document.addEventListener("visibilitychange", () =>
      dispatchRemote({
        type: "SET_ONLINE",
        payload: { memberId: meId, online: !document.hidden },
      })
    );
    return () => {
      window.removeEventListener("focus", toOnline);
      window.removeEventListener("blur", toAway);
    };
  }, [meId]);

  const value = useMemo(
    () => ({ state, dispatchRemote, meId, meName }),
    [state, meId, meName]
  );

  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatCtx);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}

/**
 * Helper to build a standardized share-note text payload that your UI can detect
 * and render as a clickable preview (no type changes needed).
 *
 * Example usage when dispatching/send:
 *   const text = makeSharedNoteText({ id, title, region, year });
 *   dispatchRemote({ type: "SEND_MESSAGE", payload: { channelId, author, text } });
 */
export function makeSharedNoteText(note: {
  id?: string | number;
  title: string;
  region?: string;
  year?: number | string;
}) {
  const parts = [
    "📝 **Shared note:**",
    note.title || "Untitled",
    note.region ? ` · ${note.region}` : "",
    note.year ? ` · ${note.year}` : "",
    note.id ? ` [#${note.id}]` : "",
  ];
  // The bracketed token (#<id>) gives your renderer a reliable hook to resolve a link.
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
