import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import ConditionChecker from "./helpers/ConditionChecker";
import { Id } from "@/convex/_generated/dataModel";
import { NoteTree, useTreeContext } from "@/providers/TreeProvider";
import { useEditorContext } from "@/providers/EditorProvider";
import { Skeleton } from "./ui/skeleton";
import { NoteCard } from "./NoteCard";
import { NewNoteCard } from "./NewNoteCard";

export default function NotesTree() {
  const { tree, onAddChildNote, onDeleteNote } = useTreeContext();
  const { getCurrentContent } = useEditorContext();

  const [editingNoteId, setEditingNoteId] = useState<Id<"notes"> | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<Id<"notes"> | null>(null);

  const handleStartAddingNote = (noteId: Id<"notes">) => {
    setEditingNoteId(noteId);
  };

  const renderNote = (note: NoteTree) => {
    return (
      <div className="flex flex-col items-center gap-8 relative">
        <div className="flex flex-col items-center relative group/node">
          {/* Vertical line from sibling group above (hidden for root) */}
          <ConditionChecker condition={note._id !== tree?._id}>
            <div className="absolute -top-8 h-8 w-px bg-border/60" />
          </ConditionChecker>

          <NoteCard
            note={note}
            isRoot={note._id === tree?._id}
            onAddChild={() => handleStartAddingNote(note._id)}
            onDelete={() => setNoteToDelete(note._id)}
          />

          {/* Vertical line to children anchor */}
          {((note.childNotes && note.childNotes.length > 0) ||
            editingNoteId === note._id) && (
            <div className="w-px h-8 bg-border/60" />
          )}
        </div>

        {((note.childNotes && note.childNotes.length > 0) ||
          editingNoteId === note._id) && (
          <div className="flex gap-8 relative px-4">
            {/* Horizontal bridge line for siblings */}
            {(note.childNotes?.length ?? 0) +
              (editingNoteId === note._id ? 1 : 0) >
              1 && (
              <div
                className="absolute -top-8 bg-border/60 h-px"
                style={{
                  left: "calc(160px / 2 + 1rem)", // half card width + padding
                  right: "calc(160px / 2 + 1rem)",
                }}
              />
            )}

            {note.childNotes?.map(childNote => {
              if (!childNote || !childNote._id || !childNote.title) return null;
              return (
                <div
                  key={childNote._id}
                  className="relative flex flex-col items-center"
                >
                  {renderNote(childNote)}
                </div>
              );
            })}

            {editingNoteId === note._id && (
              <div className="relative flex flex-col items-center">
                <div className="absolute top-[-48px] h-8 w-px bg-border/60" />
                <NewNoteCard
                  onSave={title => {
                    if (title.trim()) {
                      onAddChildNote(note._id, title, getCurrentContent);
                    }
                    setEditingNoteId(null);
                  }}
                  onCancel={() => setEditingNoteId(null)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="w-full h-full inline-flex justify-center items-start overflow-auto">
        <ConditionChecker condition={!tree}>
          <div className="flex flex-col gap-8 items-center">
            <Skeleton className="w-48 h-16 rounded-lg" />
            <div className="flex gap-4">
              <Skeleton className="w-40 h-14 rounded-lg" />
              <Skeleton className="w-40 h-14 rounded-lg" />
            </div>
          </div>
        </ConditionChecker>
        {!!tree && renderNote(tree)}
      </div>
      <AlertDialog
        open={noteToDelete !== null}
        onOpenChange={open => !open && setNoteToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this
              note and all of its child notes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setNoteToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (noteToDelete) {
                  onDeleteNote(noteToDelete);
                  setNoteToDelete(null);
                }
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
