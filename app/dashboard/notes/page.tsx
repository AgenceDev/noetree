"use client";
import { DragDropProvider, PointerSensor } from "@dnd-kit/react";
import { PointerActivationConstraints } from "@dnd-kit/dom";
import { useSortable, isSortable } from "@dnd-kit/react/sortable";
import { cn } from "@/lib/utils";

import ConditionChecker from "@/components/helpers/ConditionChecker";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import Link from "next/link";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useState } from "react";
import { Search, MoreVertical, Edit, Copy, Trash } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

const newTreeFormSchema = z.object({
  title: z
    .string()
    .nonempty("Title is required")
    .max(50, "Title is too long")
    .min(3, "Title is too short"),
});

const customSensors = [
  PointerSensor.configure({
    activationConstraints: [
      new PointerActivationConstraints.Distance({ value: 5 }),
    ],
    preventActivation: event => {
      const target = event.target as Element;
      return !!(
        target.closest("button") ||
        target.closest("input") ||
        target.closest("textarea") ||
        target.closest("[role='menu']") ||
        target.closest("[role='menuitem']")
      );
    },
  }),
];

interface DashboardSortableItemProps {
  tree: {
    _id: Id<"notes">;
    title: string;
    childNotes?: unknown[] | undefined;
    nestedNotesCount?: number;
  };
  index: number;
  duplicateNote: (args: { id: Id<"notes"> }) => void;
  setNoteToRename: (val: { id: Id<"notes">; title: string } | null) => void;
  setNewTitle: (val: string) => void;
  setRenameError: (val: string | null) => void;
  setRenameDialogOpen: (val: boolean) => void;
  setNoteToDelete: (val: Id<"notes"> | null) => void;
  setDeleteAlertDialogOpen: (val: boolean) => void;
}

function DashboardSortableItem({
  tree,
  index,
  duplicateNote,
  setNoteToRename,
  setNewTitle,
  setRenameError,
  setRenameDialogOpen,
  setNoteToDelete,
  setDeleteAlertDialogOpen,
}: DashboardSortableItemProps) {
  const { ref, isDragging } = useSortable({
    id: tree._id,
    index,
  });

  const isTemp = typeof tree._id === "string" && tree._id.startsWith("temp-");

  return (
    <div
      ref={ref}
      className={cn(
        "relative group transition-transform h-full",
        isDragging ? "opacity-50 scale-95 z-20" : "hover:scale-[1.02]",
        isTemp && "opacity-60 pointer-events-none animate-pulse",
      )}
    >
      <ContextMenu>
        <ContextMenuTrigger disabled={isTemp}>
          <div className="h-full relative">
            <Link
              href={isTemp ? "#" : `/dashboard/notes/${tree._id}`}
              className={cn("block h-full", isTemp && "pointer-events-none")}
            >
              <Card className="h-full hover:bg-muted/50 transition-colors pr-10">
                <CardHeader>
                  <CardTitle className="text-xl pr-6 truncate">
                    {tree.title}
                  </CardTitle>
                  <CardDescription>
                    {tree.nestedNotesCount ?? 0} nested note(s)
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
            <div className="absolute top-4 right-4 z-10">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  onClick={e => e.stopPropagation()}
                >
                  <DropdownMenuItem
                    onClick={() => {
                      setNoteToRename({
                        id: tree._id,
                        title: tree.title,
                      });
                      setNewTitle(tree.title);
                      setRenameError(null);
                      setRenameDialogOpen(true);
                    }}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Modifier
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      duplicateNote({ id: tree._id });
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Dupliquer
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      setNoteToDelete(tree._id);
                      setDeleteAlertDialogOpen(true);
                    }}
                  >
                    <Trash className="mr-2 h-4 w-4" />
                    Supprimer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onClick={() => {
              setNoteToRename({ id: tree._id, title: tree.title });
              setNewTitle(tree.title);
              setRenameError(null);
              setRenameDialogOpen(true);
            }}
          >
            <Edit className="mr-2 h-4 w-4" />
            Modifier
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              duplicateNote({ id: tree._id });
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            Dupliquer
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onClick={() => {
              setNoteToDelete(tree._id);
              setDeleteAlertDialogOpen(true);
            }}
          >
            <Trash className="mr-2 h-4 w-4" />
            Supprimer
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}

interface DashboardTreeItem {
  _id: Id<"notes">;
  _creationTime: number;
  title: string;
  content: string;
  childNotes?: unknown[] | undefined;
  nestedNotesCount?: number;
  index?: number;
}

export default function Notes() {
  const [newTreeDialogOpen, setNewTreeDialogOpen] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [noteToRename, setNoteToRename] = useState<{
    id: Id<"notes">;
    title: string;
  } | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  const [deleteAlertDialogOpen, setDeleteAlertDialogOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<Id<"notes"> | null>(null);

  const queryClient = useQueryClient();
  const queryKey = convexQuery(api.notes.getTreesByMe, { deep: 2 }).queryKey;

  const { data, isPending, error } = useQuery(
    convexQuery(api.notes.getTreesByMe, { deep: 2 }),
  );

  const filteredTrees = data?.filter(tree =>
    tree.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const updateNoteTitleMutate = useConvexMutation(api.notes.updateNoteTitle);
  const { mutate: updateNoteTitle } = useMutation<
    unknown,
    Error,
    Parameters<typeof updateNoteTitleMutate>[0],
    { previousTrees: DashboardTreeItem[] | undefined }
  >({
    mutationFn: updateNoteTitleMutate,
    onMutate: async variables => {
      setRenameDialogOpen(false);
      setNoteToRename(null);
      setNewTitle("");
      setRenameError(null);

      await queryClient.cancelQueries({ queryKey });
      const previousTrees =
        queryClient.getQueryData<DashboardTreeItem[]>(queryKey);
      if (previousTrees) {
        const updated = previousTrees.map(tree => {
          if (tree._id === variables.id) {
            return { ...tree, title: variables.title };
          }
          return tree;
        });
        queryClient.setQueryData(queryKey, updated);
      }
      return { previousTrees };
    },
    onError: (
      err,
      variables,
      context?: { previousTrees: DashboardTreeItem[] | undefined },
    ) => {
      if (context?.previousTrees) {
        queryClient.setQueryData(queryKey, context.previousTrees);
      }
    },
  });

  const { mutate: duplicateNote } = useMutation({
    mutationFn: useConvexMutation(api.notes.duplicateNote),
  });

  const deleteNoteMutate = useConvexMutation(api.notes.deleteNote);
  const { mutate: deleteNote } = useMutation<
    unknown,
    Error,
    Parameters<typeof deleteNoteMutate>[0],
    { previousTrees: DashboardTreeItem[] | undefined }
  >({
    mutationFn: deleteNoteMutate,
    onMutate: async variables => {
      setDeleteAlertDialogOpen(false);
      setNoteToDelete(null);

      await queryClient.cancelQueries({ queryKey });
      const previousTrees =
        queryClient.getQueryData<DashboardTreeItem[]>(queryKey);
      if (previousTrees) {
        const updated = previousTrees.filter(tree => tree._id !== variables.id);
        queryClient.setQueryData(queryKey, updated);
      }
      return { previousTrees };
    },
    onError: (
      err,
      variables,
      context?: { previousTrees: DashboardTreeItem[] | undefined },
    ) => {
      if (context?.previousTrees) {
        queryClient.setQueryData(queryKey, context.previousTrees);
      }
    },
  });

  const updateNoteIndexMutate = useConvexMutation(api.notes.updateNoteIndex);
  const { mutate: updateNoteIndex } = useMutation<
    unknown,
    Error,
    Parameters<typeof updateNoteIndexMutate>[0],
    { previousTrees: DashboardTreeItem[] | undefined }
  >({
    mutationFn: updateNoteIndexMutate,
    onMutate: async variables => {
      await queryClient.cancelQueries({ queryKey });
      const previousTrees =
        queryClient.getQueryData<DashboardTreeItem[]>(queryKey);
      if (previousTrees) {
        const updated = previousTrees.map(tree => {
          if (tree._id === variables.id) {
            return { ...tree, index: variables.index };
          }
          return tree;
        });
        updated.sort((a, b) => {
          const indexA = a.index ?? a._creationTime;
          const indexB = b.index ?? b._creationTime;
          return indexA - indexB;
        });
        queryClient.setQueryData(queryKey, updated);
      }
      return { previousTrees };
    },
    onError: (
      err,
      variables,
      context?: { previousTrees: DashboardTreeItem[] | undefined },
    ) => {
      if (context?.previousTrees) {
        queryClient.setQueryData(queryKey, context.previousTrees);
      }
    },
  });

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = newTitle.trim();
    if (!cleanTitle || cleanTitle.length < 3) {
      setRenameError("Title must be at least 3 characters");
      return;
    }
    if (cleanTitle.length > 50) {
      setRenameError("Title is too long");
      return;
    }

    const titleExists = data?.some(
      note =>
        note._id !== noteToRename?.id &&
        note.title.toLowerCase() === cleanTitle.toLowerCase(),
    );

    if (titleExists) {
      setRenameError("A note with this title already exists");
      return;
    }

    if (noteToRename) {
      updateNoteTitle({ id: noteToRename.id, title: cleanTitle });
    }
  };

  const newTreeForm = useForm<z.infer<typeof newTreeFormSchema>>({
    resolver: zodResolver(newTreeFormSchema),
    defaultValues: { title: "" },
  });

  const createNoteMutate = useConvexMutation(api.notes.createNote);
  const { mutate: createNote, isPending: isNotePending } = useMutation<
    unknown,
    Error,
    Parameters<typeof createNoteMutate>[0],
    { previousTrees: DashboardTreeItem[] | undefined }
  >({
    mutationFn: createNoteMutate,
    onMutate: async variables => {
      newTreeForm.reset();
      setNewTreeDialogOpen(false);
      setTitleError(null);

      await queryClient.cancelQueries({ queryKey });
      const previousTrees =
        queryClient.getQueryData<DashboardTreeItem[]>(queryKey);
      if (previousTrees) {
        const tempId = `temp-${Math.random()}` as unknown as Id<"notes">;
        const newTree: DashboardTreeItem = {
          _id: tempId,
          _creationTime: Date.now(),
          title: variables.title,
          content: variables.content || "{}",
          childNotes: [],
          nestedNotesCount: 0,
        };
        queryClient.setQueryData(queryKey, [...previousTrees, newTree]);
      }
      return { previousTrees };
    },
    onError: (
      err,
      variables,
      context?: { previousTrees: DashboardTreeItem[] | undefined },
    ) => {
      if (context?.previousTrees) {
        queryClient.setQueryData(queryKey, context.previousTrees);
      }
    },
  });

  const handleSubmit = newTreeForm.handleSubmit(async formData => {
    const titleExists = data?.some(
      note => note.title.toLowerCase() === formData.title.toLowerCase(),
    );

    if (titleExists) {
      setTitleError("A note with this title already exists");
      return;
    }

    setTitleError(null);
    createNote(formData);
  });

  return (
    <div className="flex flex-col justify-center items-center gap-8 p-6">
      <h1 className="text-8xl font-bold">Trees</h1>

      <ConditionChecker
        condition={!isPending && !error && !!data && data.length > 0}
      >
        <ButtonGroup>
          <Input
            type="search"
            placeholder="Search trees..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <Button variant="outline" aria-label="Search" type="button">
            <Search />
          </Button>
        </ButtonGroup>
      </ConditionChecker>

      <ConditionChecker condition={!!isPending}>
        <p>Loading trees...</p>
      </ConditionChecker>

      <ConditionChecker condition={!isPending && !error && !!data}>
        <ConditionChecker condition={!!data && data.length === 0}>
          <p>You have no trees.</p>
        </ConditionChecker>

        <ConditionChecker
          condition={
            !!data &&
            data.length > 0 &&
            !!filteredTrees &&
            filteredTrees.length === 0
          }
        >
          <p className="text-muted-foreground">No trees match your search.</p>
        </ConditionChecker>

        <ConditionChecker
          condition={!!filteredTrees && filteredTrees.length > 0}
        >
          <DragDropProvider
            sensors={customSensors}
            onDragEnd={({ operation }) => {
              const { source } = operation;
              if (isSortable(source) && filteredTrees) {
                const { initialIndex, index: newIndex } = source.sortable;
                if (initialIndex !== newIndex) {
                  const updated = [...filteredTrees];
                  const [moved] = updated.splice(initialIndex, 1);
                  updated.splice(newIndex, 0, moved);

                  // Calculate fractional index
                  const getNoteIndex = (note: typeof moved) =>
                    note.index ?? note._creationTime;
                  let newIndexValue: number;

                  if (newIndex === 0) {
                    newIndexValue = getNoteIndex(updated[1]) - 1000;
                  } else if (newIndex === updated.length - 1) {
                    newIndexValue =
                      getNoteIndex(updated[updated.length - 2]) + 1000;
                  } else {
                    newIndexValue =
                      (getNoteIndex(updated[newIndex - 1]) +
                        getNoteIndex(updated[newIndex + 1])) /
                      2;
                  }

                  updateNoteIndex({
                    id: moved._id,
                    index: newIndexValue,
                  });
                }
              }
            }}
          >
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 w-full max-w-6xl">
              {filteredTrees?.map((tree, index) => (
                <DashboardSortableItem
                  key={tree._id}
                  tree={tree}
                  index={index}
                  duplicateNote={duplicateNote}
                  setNoteToRename={setNoteToRename}
                  setNewTitle={setNewTitle}
                  setRenameError={setRenameError}
                  setRenameDialogOpen={setRenameDialogOpen}
                  setNoteToDelete={setNoteToDelete}
                  setDeleteAlertDialogOpen={setDeleteAlertDialogOpen}
                />
              ))}
            </div>
          </DragDropProvider>
        </ConditionChecker>
      </ConditionChecker>

      <ConditionChecker condition={!!error}>
        <p>Error loading trees.</p>
      </ConditionChecker>

      <Dialog open={newTreeDialogOpen} onOpenChange={setNewTreeDialogOpen}>
        <DialogTrigger asChild>
          <Button>Create a new tree</Button>
        </DialogTrigger>
        <DialogContent>
          <Form {...newTreeForm}>
            <form onSubmit={handleSubmit} className="contents">
              <DialogHeader>
                <DialogTitle>Create a new tree</DialogTitle>
                <DialogDescription>
                  Fill in the form below to create a new tree
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-8">
                <FormField
                  control={newTreeForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter tree title" {...field} />
                      </FormControl>
                      <FormDescription>
                        This is your tree title.
                      </FormDescription>
                      <FormMessage />
                      {titleError && (
                        <p className="text-sm font-medium text-destructive mt-1">
                          {titleError}
                        </p>
                      )}
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Close
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isNotePending}>
                  <span>Create</span>
                  <ConditionChecker condition={isNotePending}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 200 200"
                    >
                      <circle
                        fill="currentcolor"
                        stroke="currentcolor"
                        strokeWidth="15"
                        r="15"
                        cx="40"
                        cy="65"
                      >
                        <animate
                          attributeName="cy"
                          calcMode="spline"
                          dur="1"
                          values="65;135;65;"
                          keySplines=".5 0 .5 1;.5 0 .5 1"
                          repeatCount="indefinite"
                          begin="-.4"
                        ></animate>
                      </circle>
                      <circle
                        fill="currentcolor"
                        stroke="currentcolor"
                        strokeWidth="15"
                        r="15"
                        cx="100"
                        cy="65"
                      >
                        <animate
                          attributeName="cy"
                          calcMode="spline"
                          dur="1"
                          values="65;135;65;"
                          keySplines=".5 0 .5 1;.5 0 .5 1"
                          repeatCount="indefinite"
                          begin="-.2"
                        ></animate>
                      </circle>
                      <circle
                        fill="currentcolor"
                        stroke="currentcolor"
                        strokeWidth="15"
                        r="15"
                        cx="160"
                        cy="65"
                      >
                        <animate
                          attributeName="cy"
                          calcMode="spline"
                          dur="1"
                          values="65;135;65;"
                          keySplines=".5 0 .5 1;.5 0 .5 1"
                          repeatCount="indefinite"
                          begin="0"
                        ></animate>
                      </circle>
                    </svg>
                  </ConditionChecker>
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <form onSubmit={handleRenameSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Rename tree</DialogTitle>
              <DialogDescription>
                Enter a new title for &quot;{noteToRename?.title}&quot;
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Input
                placeholder="Enter tree title"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
              />
              {renameError && (
                <p className="text-sm font-medium text-destructive mt-1">
                  {renameError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRenameDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteAlertDialogOpen}
        onOpenChange={setDeleteAlertDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this
              tree and all of its nested notes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeleteAlertDialogOpen(false);
                setNoteToDelete(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => {
                if (noteToDelete) {
                  deleteNote({ id: noteToDelete });
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
