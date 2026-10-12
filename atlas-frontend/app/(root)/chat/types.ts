export type ID = string;

export type Channel = {
  id: ID;
  name: string; 
};

export type Message = {
  id: ID;
  channelId: ID;
  author: string;
  text: string;
  ts: number;
};

export type Member = {
  id: ID;
  name: string;
  online: boolean;
  typingIn?: ID | null; 
};

export type ChatState = {
  channels: Channel[];
  activeChannelId: ID;
  messages: Message[];
  members: Member[];
};
// Chat actions
export type ChatAction =
  | { type: "SEND_MESSAGE"; payload: { channelId: ID; author: string; text: string } }
  | { type: "ADD_CHANNEL"; payload: { name: string } }
  | { type: "SWITCH_CHANNEL"; payload: { channelId: ID } }
  | { type: "SET_ONLINE"; payload: { memberId: ID; online: boolean } }
  | { type: "START_TYPING"; payload: { memberId: ID; channelId: ID } }
  | { type: "STOP_TYPING"; payload: { memberId: ID } };
