import { useState, useRef, useEffect } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "./ui/context-menu";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
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

export default function NotesTree() {
  const {
    tree,
    selectedNote,
    onSelectNote,
    onUpdateNoteTitle,
    onAddChildNote,
    onDeleteNote,
  } = useTreeContext();

  const { getCurrentContent } = useEditorContext();

  const [editingNoteId, setEditingNoteId] = useState<Id<"notes"> | null>(null);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [renamingNoteId, setRenamingNoteId] = useState<Id<"notes"> | null>(
    null,
  );
  const [editedTitle, setEditedTitle] = useState("");
  const [noteToDelete, setNoteToDelete] = useState<Id<"notes"> | null>(null);
  const [pendingFocusNoteId, setPendingFocusNoteId] =
    useState<Id<"notes"> | null>(null);

  const addNoteInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pendingFocusNoteId !== null && editingNoteId === pendingFocusNoteId) {
      setTimeout(() => {
        if (addNoteInputRef.current) {
          addNoteInputRef.current.focus();
        }
      }, 0);
      setPendingFocusNoteId(null);
    }
  }, [editingNoteId, pendingFocusNoteId]);

  const addChildNote = (note: NoteTree) => {
    if (newNoteTitle.trim() === "") return;

    onAddChildNote(note._id, newNoteTitle);
    setNewNoteTitle("");
    setEditingNoteId(null);
  };

  const handleStartAddingNote = (noteId: Id<"notes">) => {
    setEditingNoteId(noteId);
    setPendingFocusNoteId(noteId);
    setNewNoteTitle("");
  };

  const handleStartRenamingNote = (note: NoteTree) => {
    setRenamingNoteId(note._id);
    setEditedTitle(note.title);
  };

  const saveRenamedNote = (note: NoteTree) => {
    if (editedTitle.trim() === "") return;
    onUpdateNoteTitle(note._id, editedTitle);
    setRenamingNoteId(null);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    note: NoteTree,
  ) => {
    if (e.key === "Enter") {
      addChildNote(note);
    }
    if (e.key === "Escape") {
      setEditingNoteId(null);
    }
  };

  const handleRenameKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    note: NoteTree,
  ) => {
    if (e.key === "Enter") {
      saveRenamedNote(note);
    }
    if (e.key === "Escape") {
      setRenamingNoteId(null);
    }
  };

  const renderNote = (note: NoteTree) => {
    return (
      <>
        <ConditionChecker condition={renamingNoteId === note._id}>
          <Input
            type="text"
            value={editedTitle}
            onChange={e => setEditedTitle(e.target.value)}
            onKeyDown={e => handleRenameKeyDown(e, note)}
            onBlur={() => saveRenamedNote(note)}
            autoFocus
          />
        </ConditionChecker>

        <ConditionChecker condition={renamingNoteId !== note._id}>
          <ContextMenu>
            <ContextMenuTrigger>
              <Button
                type="button"
                variant={
                  selectedNote?._id === note._id ? "default" : "secondary"
                }
                onClick={() => onSelectNote(note, getCurrentContent)}
                onDoubleClick={() => handleStartRenamingNote(note)}
              >
                {note.title}
              </Button>
            </ContextMenuTrigger>
            <ContextMenuContent
              onFocusOutside={e => e.preventDefault()}
              onCloseAutoFocus={event => {
                event.preventDefault();
              }}
            >
              <ContextMenuItem onClick={() => handleStartAddingNote(note._id)}>
                Add a child note
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleStartRenamingNote(note)}>
                Rename
              </ContextMenuItem>
              <ConditionChecker condition={note._id !== tree?._id}>
                <ContextMenuItem
                  variant="destructive"
                  onClick={() => setNoteToDelete(note._id)}
                >
                  Delete
                </ContextMenuItem>
              </ConditionChecker>
            </ContextMenuContent>
          </ContextMenu>
        </ConditionChecker>

        <ul className="flex flex-col items-start gap-4 mt-4 border-l-2 border-gray-200 pl-6">
          {note.childNotes?.map((childNote: NoteTree) => {
            if (!childNote || !childNote._id || !childNote.title) return null;
            return <li key={childNote._id}>{renderNote(childNote)}</li>;
          })}
          <li>
            <ConditionChecker condition={editingNoteId === note._id}>
              <Input
                ref={addNoteInputRef}
                type="text"
                value={newNoteTitle}
                onChange={e => setNewNoteTitle(e.target.value)}
                onKeyDown={e => handleKeyDown(e, note)}
                onBlur={() => setEditingNoteId(null)}
                placeholder="Note title"
                autoFocus
              />
            </ConditionChecker>

            <ConditionChecker condition={editingNoteId !== note._id}>
              <Button
                variant="outline"
                onClick={() => handleStartAddingNote(note._id)}
              >
                Add child note
              </Button>
            </ConditionChecker>
          </li>
        </ul>
      </>
    );
  };

  return (
    <div>
      <ConditionChecker condition={!tree}>
        <ul className="flex flex-col items-start gap-4 mt-4 border-l-2 border-gray-200 pl-6">
          <li>
            <Skeleton className="w-24 h-8" />
          </li>
          <li>
            <Skeleton className="w-32 h-8" />
          </li>
        </ul>
      </ConditionChecker>
      {!!tree && renderNote(tree)}
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
