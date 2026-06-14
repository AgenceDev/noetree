import { Doc, Id } from "@/convex/_generated/dataModel";
import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useParams } from "next/navigation";

export interface NoteTree extends Omit<Doc<"notes">, "childNotes"> {
  childNotes?: NoteTree[];
}

const findNoteById = (noteId: Id<"notes">, note: NoteTree): NoteTree | null => {
  if (note._id === noteId) return note;
  if (!note.childNotes?.length) return null;

  for (const childNote of note.childNotes) {
    const found = findNoteById(noteId, childNote);
    if (found) return found;
  }
  return null;
};

const addChildNoteToTree = (
  root: NoteTree,
  parentId: Id<"notes">,
  newNoteTitle: string,
  tempId: string,
): NoteTree => {
  const clone = JSON.parse(JSON.stringify(root)) as NoteTree;

  const addChild = (node: NoteTree): boolean => {
    if (node._id === parentId) {
      if (!node.childNotes) node.childNotes = [];
      node.childNotes.push({
        _id: tempId as unknown as Id<"notes">,
        _creationTime: Date.now(),
        title: newNoteTitle,
        content: "",
        parentNote: parentId,
        owner: node.owner,
        childNotes: [],
      });
      return true;
    }
    if (node.childNotes) {
      for (const child of node.childNotes) {
        if (addChild(child)) return true;
      }
    }
    return false;
  };

  addChild(clone);
  return clone;
};

const moveNoteInTree = (
  root: NoteTree,
  noteId: Id<"notes">,
  fromId: Id<"notes">,
  toId: Id<"notes">,
  index?: number,
): NoteTree => {
  const clone = JSON.parse(JSON.stringify(root)) as NoteTree;

  let movedNode: NoteTree | null = null;
  const removeNode = (node: NoteTree): boolean => {
    if (node.childNotes) {
      const idx = node.childNotes.findIndex(c => c._id === noteId);
      if (idx !== -1) {
        [movedNode] = node.childNotes.splice(idx, 1);
        return true;
      }
      for (const child of node.childNotes) {
        if (removeNode(child)) return true;
      }
    }
    return false;
  };

  const insertNode = (node: NoteTree): boolean => {
    if (node._id === toId) {
      if (!node.childNotes) node.childNotes = [];
      if (movedNode) {
        movedNode.parentNote = toId;
        if (index !== undefined) {
          node.childNotes.splice(index, 0, movedNode);
        } else {
          node.childNotes.push(movedNode);
        }
      }
      return true;
    }
    if (node.childNotes) {
      for (const child of node.childNotes) {
        if (insertNode(child)) return true;
      }
    }
    return false;
  };

  if (clone._id === noteId) {
    movedNode = { ...clone };
  } else {
    removeNode(clone);
  }

  if (movedNode) {
    insertNode(clone);
  }

  return clone;
};

const updateChildOrderInTree = (
  root: NoteTree,
  parentId: Id<"notes">,
  orderedChildIds: Id<"notes">[],
): NoteTree => {
  const clone = JSON.parse(JSON.stringify(root)) as NoteTree;

  const updateOrder = (node: NoteTree): boolean => {
    if (node._id === parentId) {
      if (node.childNotes) {
        const mapped = orderedChildIds
          .map(id => node.childNotes!.find(c => c._id === id))
          .filter((c): c is NoteTree => !!c);
        node.childNotes = mapped;
      }
      return true;
    }
    if (node.childNotes) {
      for (const child of node.childNotes) {
        if (updateOrder(child)) return true;
      }
    }
    return false;
  };

  updateOrder(clone);
  return clone;
};

const removeNoteFromTree = (root: NoteTree, noteId: Id<"notes">): NoteTree => {
  const clone = JSON.parse(JSON.stringify(root)) as NoteTree;

  const removeNode = (node: NoteTree): boolean => {
    if (node.childNotes) {
      const idx = node.childNotes.findIndex(c => c._id === noteId);
      if (idx !== -1) {
        node.childNotes.splice(idx, 1);
        return true;
      }
      for (const child of node.childNotes) {
        if (removeNode(child)) return true;
      }
    }
    return false;
  };

  removeNode(clone);
  return clone;
};

const updateTitleInTree = (
  root: NoteTree,
  noteId: Id<"notes">,
  newTitle: string,
): NoteTree => {
  const clone = JSON.parse(JSON.stringify(root)) as NoteTree;

  const updateTitle = (node: NoteTree): boolean => {
    if (node._id === noteId) {
      node.title = newTitle;
      return true;
    }
    if (node.childNotes) {
      for (const child of node.childNotes) {
        if (updateTitle(child)) return true;
      }
    }
    return false;
  };

  updateTitle(clone);
  return clone;
};

interface TreeContextType {
  tree: NoteTree | null;
  selectedNote: NoteTree | null;
  onSelectNote: (
    note: NoteTree,
    getCurrentEditorContent?: () => string | null,
  ) => void;
  onUpdateNoteTitle: (noteId: Id<"notes">, newTitle: string) => void;
  onUpdateNoteContent: (newContent: string) => void;
  onAddChildNote: (
    parentId: Id<"notes">,
    newNoteTitle: string,
    getCurrentEditorContent?: () => string | null,
  ) => void;
  onDeleteNote: (noteId: Id<"notes">) => void;
  onDuplicateNote: (noteId: Id<"notes">) => void;
  onUpdateChildNotesOrder: (
    parentId: Id<"notes">,
    orderedChildIds: Id<"notes">[],
  ) => void;
  onMoveNote: (
    noteId: Id<"notes">,
    fromParentId: Id<"notes">,
    toParentId: Id<"notes">,
    index?: number,
  ) => void;
}

const TreeContext = createContext<TreeContextType>({
  tree: null,
  selectedNote: null,
  onSelectNote: () => {},
  onUpdateNoteTitle: () => {},
  onUpdateNoteContent: () => {},
  onAddChildNote: () => {},
  onDeleteNote: () => {},
  onDuplicateNote: () => {},
  onUpdateChildNotesOrder: () => {},
  onMoveNote: () => {},
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

  const queryClient = useQueryClient();
  const queryKey = convexQuery(api.notes.getTreeById, {
    id: noteId,
    deep: 10,
  }).queryKey;

  const { data: tree } = useQuery(
    convexQuery(api.notes.getTreeById, { id: noteId, deep: 10 }),
  );

  const updateNoteTitleMutate = useConvexMutation(api.notes.updateNoteTitle);
  const { mutate: updateNoteTitle } = useMutation<
    unknown,
    Error,
    Parameters<typeof updateNoteTitleMutate>[0],
    { previousTree: NoteTree | undefined }
  >({
    mutationFn: updateNoteTitleMutate,
    onMutate: async variables => {
      await queryClient.cancelQueries({ queryKey });
      const previousTree = queryClient.getQueryData<NoteTree>(queryKey);
      if (previousTree) {
        const newTree = updateTitleInTree(
          previousTree,
          variables.id,
          variables.title,
        );
        queryClient.setQueryData(queryKey, newTree);
      }
      return { previousTree };
    },
    onError: (
      err,
      variables,
      context?: { previousTree: NoteTree | undefined },
    ) => {
      if (context?.previousTree) {
        queryClient.setQueryData(queryKey, context.previousTree);
      }
    },
  });

  const { mutate: updateNoteContent } = useMutation({
    mutationFn: useConvexMutation(api.notes.updateNoteContent),
  });

  const createNoteMutate = useConvexMutation(api.notes.createNote);
  const { mutate: createNote } = useMutation<
    Id<"notes">,
    Error,
    Parameters<typeof createNoteMutate>[0],
    { previousTree: NoteTree | undefined }
  >({
    mutationFn: createNoteMutate,
    onMutate: async variables => {
      await queryClient.cancelQueries({ queryKey });
      const previousTree = queryClient.getQueryData<NoteTree>(queryKey);
      const tempId = `temp-${Math.random()}`;
      if (previousTree && variables.parentNote) {
        const newTree = addChildNoteToTree(
          previousTree,
          variables.parentNote,
          variables.title,
          tempId,
        );
        queryClient.setQueryData(queryKey, newTree);
      }
      return { previousTree };
    },
    onError: (
      err,
      variables,
      context?: { previousTree: NoteTree | undefined },
    ) => {
      if (context?.previousTree) {
        queryClient.setQueryData(queryKey, context.previousTree);
      }
    },
    onSuccess: (newNoteId: Id<"notes">) => {
      setSelectedNoteId(newNoteId);
    },
  });

  const deleteNoteMutate = useConvexMutation(api.notes.deleteNote);
  const { mutate: deleteNote } = useMutation<
    unknown,
    Error,
    Parameters<typeof deleteNoteMutate>[0],
    { previousTree: NoteTree | undefined }
  >({
    mutationFn: deleteNoteMutate,
    onMutate: async variables => {
      await queryClient.cancelQueries({ queryKey });
      const previousTree = queryClient.getQueryData<NoteTree>(queryKey);
      if (previousTree) {
        const newTree = removeNoteFromTree(previousTree, variables.id);
        queryClient.setQueryData(queryKey, newTree);
      }
      return { previousTree };
    },
    onError: (
      err,
      variables,
      context?: { previousTree: NoteTree | undefined },
    ) => {
      if (context?.previousTree) {
        queryClient.setQueryData(queryKey, context.previousTree);
      }
    },
  });

  const { mutate: duplicateNote } = useMutation({
    mutationFn: useConvexMutation(api.notes.duplicateNote),
  });

  const updateChildNotesMutate = useConvexMutation(api.notes.updateChildNotes);
  const { mutate: updateChildNotes } = useMutation<
    unknown,
    Error,
    Parameters<typeof updateChildNotesMutate>[0],
    { previousTree: NoteTree | undefined }
  >({
    mutationFn: updateChildNotesMutate,
    onMutate: async variables => {
      await queryClient.cancelQueries({ queryKey });
      const previousTree = queryClient.getQueryData<NoteTree>(queryKey);
      if (previousTree) {
        const newTree = updateChildOrderInTree(
          previousTree,
          variables.id,
          variables.childNotes || [],
        );
        queryClient.setQueryData(queryKey, newTree);
      }
      return { previousTree };
    },
    onError: (
      err,
      variables,
      context?: { previousTree: NoteTree | undefined },
    ) => {
      if (context?.previousTree) {
        queryClient.setQueryData(queryKey, context.previousTree);
      }
    },
  });

  const moveNoteMutate = useConvexMutation(api.notes.moveNote);
  const { mutate: moveNote } = useMutation<
    unknown,
    Error,
    Parameters<typeof moveNoteMutate>[0],
    { previousTree: NoteTree | undefined }
  >({
    mutationFn: moveNoteMutate,
    onMutate: async variables => {
      await queryClient.cancelQueries({ queryKey });
      const previousTree = queryClient.getQueryData<NoteTree>(queryKey);
      if (previousTree) {
        const newTree = moveNoteInTree(
          previousTree,
          variables.id,
          variables.from,
          variables.to,
          variables.index,
        );
        queryClient.setQueryData(queryKey, newTree);
      }
      return { previousTree };
    },
    onError: (
      err,
      variables,
      context?: { previousTree: NoteTree | undefined },
    ) => {
      if (context?.previousTree) {
        queryClient.setQueryData(queryKey, context.previousTree);
      }
    },
  });

  const selectedNote = useMemo(() => {
    if (!tree) return null;
    return findNoteById(selectedNoteId, tree as unknown as NoteTree);
  }, [tree, selectedNoteId]);

  const contextValue = useMemo(
    () => ({
      tree: tree as unknown as NoteTree,
      selectedNote,
      onSelectNote: (
        note: NoteTree,
        getCurrentEditorContent?: () => string | null,
      ) => {
        if (selectedNoteId === note._id) return;

        if (selectedNote && getCurrentEditorContent) {
          const currentContent = getCurrentEditorContent();
          if (currentContent) {
            updateNoteContent({
              id: selectedNote._id,
              content: currentContent,
            });
          }
        }

        setSelectedNoteId(note._id);
      },
      onUpdateNoteTitle: (noteId: Id<"notes">, newTitle: string) => {
        if (!selectedNote) return;
        updateNoteTitle({
          id: noteId,
          title: newTitle,
        });
      },
      onUpdateNoteContent: (newContent: string) => {
        if (!selectedNote) return;
        updateNoteContent({
          id: selectedNote._id,
          content: newContent,
        });
      },
      onAddChildNote: (
        parentId: Id<"notes">,
        newNoteTitle: string,
        getCurrentEditorContent?: () => string | null,
      ) => {
        if (selectedNote && getCurrentEditorContent) {
          const currentContent = getCurrentEditorContent();
          if (currentContent) {
            updateNoteContent({
              id: selectedNote._id,
              content: currentContent,
            });
          }
        }

        createNote({
          title: newNoteTitle,
          content: "",
          parentNote: parentId,
        });
      },
      onDeleteNote: (noteId: Id<"notes">) => {
        const currentTree = tree as unknown as NoteTree;
        const noteToDelete = currentTree
          ? findNoteById(noteId, currentTree)
          : null;

        if (noteToDelete) {
          // If the selected note is the one being deleted OR one of its descendants
          const isSelectedInBranch = !!findNoteById(
            selectedNoteId,
            noteToDelete,
          );

          if (isSelectedInBranch) {
            if (noteToDelete.parentNote) {
              setSelectedNoteId(noteToDelete.parentNote);
            } else if (currentTree && currentTree._id !== noteId) {
              setSelectedNoteId(currentTree._id);
            }
          }
        }

        deleteNote({
          id: noteId,
        });
      },
      onDuplicateNote: (noteId: Id<"notes">) => {
        duplicateNote({
          id: noteId,
        });
      },
      onUpdateChildNotesOrder: (
        parentId: Id<"notes">,
        orderedChildIds: Id<"notes">[],
      ) => {
        updateChildNotes({
          id: parentId,
          childNotes: orderedChildIds,
        });
      },
      onMoveNote: (
        noteId: Id<"notes">,
        fromParentId: Id<"notes">,
        toParentId: Id<"notes">,
        index?: number,
      ) => {
        moveNote({
          id: noteId,
          from: fromParentId,
          to: toParentId,
          index,
        });
      },
    }),
    [
      tree,
      selectedNote,
      selectedNoteId,
      updateNoteTitle,
      updateNoteContent,
      createNote,
      deleteNote,
      duplicateNote,
      updateChildNotes,
      moveNote,
    ],
  );

  return (
    <TreeContext.Provider value={contextValue}>{children}</TreeContext.Provider>
  );
}
