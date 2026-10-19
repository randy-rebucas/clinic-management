'use client';

import { useState } from 'react';
import type { ConversationSummary } from '@/lib/messaging';
import { AlertDialog } from '@/components/ui/Modal';
import { useMessaging } from './MessagingProvider';
import { ACTION_ICONS, ActionMenu, CHAT_FOCUS_RING } from './ChatParts';

/**
 * "More" menu for an open conversation: mark as unread, delete for me.
 * Both actions leave the thread, so `onLeave` closes whatever is showing it.
 */
export default function ConversationActions({
  conversation,
  onLeave,
  triggerClassName,
}: {
  conversation: ConversationSummary;
  onLeave: () => void;
  triggerClassName: string;
}) {
  const { markUnread, deleteConversation } = useMessaging();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    const ok = await deleteConversation(conversation.id);
    setBusy(false);
    if (!ok) {
      setError('Could not delete the conversation. Try again.');
      return;
    }
    setConfirming(false);
    onLeave();
  };

  return (
    <>
      <ActionMenu
        label="Conversation actions"
        triggerClassName={triggerClassName}
        actions={[
          {
            label: 'Mark as unread',
            icon: ACTION_ICONS.unread,
            onSelect: () => {
              onLeave();
              markUnread(conversation.id);
            },
          },
          { label: 'Delete conversation', icon: ACTION_ICONS.trash, danger: true, onSelect: () => setConfirming(true) },
        ]}
      />
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setConfirming(false);
            setError(null);
          }
        }}
        title="Delete this conversation?"
        description={
          <>
            The message history with {conversation.other.name} is removed from your view. They keep their copy, and the
            conversation comes back if either of you sends a new message.
            {error && <span role="alert" className="mt-2 block text-red-600">{error}</span>}
          </>
        }
      >
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className={`px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60 ${CHAT_FOCUS_RING}`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className={`px-3 py-2 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 ${CHAT_FOCUS_RING}`}
        >
          {busy ? 'Deleting…' : 'Delete conversation'}
        </button>
      </AlertDialog>
    </>
  );
}
