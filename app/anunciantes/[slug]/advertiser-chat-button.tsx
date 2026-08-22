"use client";

export default function AdvertiserChatButton({ listingId }: { listingId: string }) {
  async function startChat() {
    if (!listingId) return;
    const response = await fetch("/api/chat/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId }) });
    const data = await response.json() as { conversationId?: string };
    if (response.status === 401) return window.location.assign(`/entrar?returnTo=${encodeURIComponent(location.pathname)}`);
    if (data.conversationId) window.location.assign(`/minha-conta/mensagens?conversation=${encodeURIComponent(data.conversationId)}`);
  }
  return <button type="button" disabled={!listingId} onClick={() => void startChat()}>Conversar no chat</button>;
}
