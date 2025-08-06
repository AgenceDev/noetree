import { Doc, Id } from "@/convex/_generated/dataModel";
import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useQuery, useMutation } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useParams } from "next/navigation";

export interface NoteTree extends Omit<Doc<"notes">, "childNotes"> {
  childNotes?: NoteTree[];
}

interface TreeContextType {
  tree: NoteTree | null;
  selectedNote: NoteTree | null;
  onSelectNote: (
    note: NoteTree,
    getCurrentEditorContent?: () => string | null
  ) => void;
  onUpdateNoteTitle: (noteId: Id<"notes">, newTitle: string) => void;
  onUpdateNoteContent: (newContent: string) => void;
  onAddChildNote: (parentId: Id<"notes">, newNoteTitle: string) => void;
  onDeleteNote: (noteId: Id<"notes">) => void;
}

const TreeContext = createContext<TreeContextType>({
  tree: null,
  selectedNote: null,
  onSelectNote: () => {},
  onUpdateNoteTitle: () => {},
  onUpdateNoteContent: () => {},
  onAddChildNote: () => {},
  onDeleteNote: () => {}
});

export const useTreeContext = (): TreeContextType => {
  const context = useContext(TreeContext);
  if (!context)
    throw new Error("useTreeContext must be used within a TreeProvider");
  return context;
};

interface TreeProviderProps {
  children: ReactNode;
}

export function TreeProvider({ children }: Readonly<TreeProviderProps>) {
  const params = useParams();
  const noteId = params.id as Id<"notes">;
  const [selectedNoteId, setSelectedNoteId] = useState<Id<"notes">>(noteId);

  const { data: tree } = useQuery(
    convexQuery(api.notes.getTreeById, { id: noteId, deep: 10 })
  );

  const { mutate: updateNoteTitle } = useMutation({
    mutationFn: useConvexMutation(api.notes.updateNoteTitle)
  });

  const { mutate: updateNoteContent } = useMutation({
    mutationFn: useConvexMutation(api.notes.updateNoteContent)
  });

  const { mutate: createNote } = useMutation({
    mutationFn: useConvexMutation(api.notes.createNote),
    onSuccess: (newNoteId: Id<"notes">) => {
      setSelectedNoteId(newNoteId);
    }
  });

  const { mutate: deleteNote } = useMutation({
    mutationFn: useConvexMutation(api.notes.deleteNote)
  });

  const selectedNote = useMemo(() => {
    if (!tree) return null;

    const findNoteById = (
      noteId: Id<"notes">,
      note: NoteTree
    ): NoteTree | null => {
      if (note._id === noteId) return note;
      if (!note.childNotes?.length) return null;

      for (const childNote of note.childNotes) {
        const found = findNoteById(noteId, childNote);
        if (found) return found;
      }
      return null;
    };

    return findNoteById(selectedNoteId, tree as unknown as NoteTree);
  }, [tree, selectedNoteId]);

  const contextValue = useMemo(
    () => ({
      tree: tree as unknown as NoteTree,
      selectedNote,
      onSelectNote: (
        note: NoteTree,
        getCurrentEditorContent?: () => string | null
      ) => {
        if (selectedNoteId === note._id) return;

        if (selectedNote && getCurrentEditorContent) {
          const currentContent = getCurrentEditorContent();
          if (currentContent) {
            updateNoteContent({
              id: selectedNote._id,
              content: currentContent
            });
          }
        }

        setSelectedNoteId(note._id);
      },
      onUpdateNoteTitle: (noteId: Id<"notes">, newTitle: string) => {
        if (!selectedNote) return;
        updateNoteTitle({
          id: noteId,
          title: newTitle
        });
      },
      onUpdateNoteContent: (newContent: string) => {
        if (!selectedNote) return;
        updateNoteContent({
          id: selectedNote._id,
          content: newContent
        });
      },
      onAddChildNote: (parentId: Id<"notes">, newNoteTitle: string) => {
        createNote({
          title: newNoteTitle,
          content: "",
          parentNote: parentId
        });
      },
      onDeleteNote: (noteId: Id<"notes">) => {
        if (selectedNoteId === noteId && selectedNote?.parentNote) {
          setSelectedNoteId(selectedNote.parentNote);
        } else if (
          selectedNoteId === noteId &&
          !selectedNote?.parentNote &&
          tree
        ) {
          setSelectedNoteId(tree._id);
        }

        deleteNote({
          id: noteId
        });
      }
    }),
    [
      tree,
      selectedNote,
      selectedNoteId,
      updateNoteTitle,
      updateNoteContent,
      createNote,
      deleteNote
    ]
  );

  return (
    <TreeContext.Provider value={contextValue}>{children}</TreeContext.Provider>
  );
}
