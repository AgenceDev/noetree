import { useState, useRef, useCallback, useEffect } from "react";
import { Crosshair } from "lucide-react";
import { Button } from "./ui/button";
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
  const { tree, selectedNote, onAddChildNote, onDeleteNote } = useTreeContext();
  const { getCurrentContent } = useEditorContext();

  const [editingNoteId, setEditingNoteId] = useState<Id<"notes"> | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<Id<"notes"> | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const selectedCardRef = useRef<HTMLDivElement | null>(null);

  const scrollToSelected = useCallback(() => {
    const container = scrollContainerRef.current;
    const card = selectedCardRef.current;
    if (!container || !card) return;

    const containerRect = container.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();

    const scrollLeft =
      container.scrollLeft +
      (cardRect.left - containerRect.left) -
      containerRect.width / 2 +
      cardRect.width / 2;

    const scrollTop =
      container.scrollTop +
      (cardRect.top - containerRect.top) -
      containerRect.height / 2 +
      cardRect.height / 2;

    container.scrollTo({
      left: scrollLeft,
      top: scrollTop,
      behavior: "smooth",
    });
  }, []);

  // Auto-center on selection change
  useEffect(() => {
    scrollToSelected();
  }, [selectedNote?._id, scrollToSelected]);

  const handleSelectedRef = useCallback((el: HTMLDivElement | null) => {
    selectedCardRef.current = el;
  }, []);

  const handleStartAddingNote = (noteId: Id<"notes">) => {
    setEditingNoteId(noteId);
  };

  const renderNote = (note: NoteTree) => {
    return (
      <div className="flex flex-col items-center gap-8 relative">
        <div className="flex flex-col items-center relative group/node">
          <NoteCard
            note={note}
            isRoot={note._id === tree?._id}
            onAddChild={() => handleStartAddingNote(note._id)}
            onDelete={() => setNoteToDelete(note._id)}
            onRef={handleSelectedRef}
          />

          {/* Vertical line to children anchor */}
          {((note.childNotes && note.childNotes.length > 0) ||
            editingNoteId === note._id) && (
            <div className="w-px h-8 bg-border/60" />
          )}
        </div>

        {((note.childNotes && note.childNotes.length > 0) ||
          editingNoteId === note._id) && (
          <div className="tree-children flex gap-8 relative">
            {note.childNotes?.map(childNote => {
              if (!childNote || !childNote._id || !childNote.title) return null;
              return (
                <div
                  key={childNote._id}
                  className="tree-child relative flex flex-col items-center"
                >
                  {renderNote(childNote)}
                </div>
              );
            })}

            {editingNoteId === note._id && (
              <div className="tree-child relative flex flex-col items-center">
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
    <div className="relative w-full h-full">
      <div
        ref={scrollContainerRef}
        className="relative w-full h-full overflow-auto scrollbar-thin"
      >
        <div className="min-w-full inline-flex justify-center items-start p-4">
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
      </div>
      {selectedNote && (
        <Button
          variant="outline"
          size="icon"
          onClick={scrollToSelected}
          className="absolute bottom-4 right-4 z-10 h-9 w-9 rounded-full shadow-lg backdrop-blur-sm bg-background/80 border-border/60 hover:bg-accent hover:scale-110 transition-all duration-200"
          title="Recentrer sur la note active"
        >
          <Crosshair className="h-4 w-4" />
        </Button>
      )}
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
    </div>
  );
}
