"use client";

import ConditionChecker from "@/components/helpers/ConditionChecker";
import { Button } from "@/components/ui/button";
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
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
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

const newTreeFormSchema = z.object({
  title: z
    .string()
    .nonempty("Title is required")
    .max(50, "Title is too long")
    .min(3, "Title is too short"),
});

export default function Notes() {
  const [newTreeDialogOpen, setNewTreeDialogOpen] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);

  const { data, isPending, error } = useQuery(
    convexQuery(api.notes.getTreesByMe, { deep: 2 }),
  );

  const newTreeForm = useForm<z.infer<typeof newTreeFormSchema>>({
    resolver: zodResolver(newTreeFormSchema),
    defaultValues: { title: "" },
  });

  const { mutate: createNote, isPending: isNotePending } = useMutation({
    mutationFn: useConvexMutation(api.notes.createNote),
    onSuccess: () => {
      newTreeForm.reset();
      setNewTreeDialogOpen(false);
      setTitleError(null);
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

      <ConditionChecker condition={!!isPending}>
        <p>Loading trees...</p>
      </ConditionChecker>

      <ConditionChecker condition={!isPending && !error && !!data}>
        <ConditionChecker condition={!!data && data.length === 0}>
          <p>You have no trees.</p>
        </ConditionChecker>

        <ConditionChecker condition={!!data && data.length > 0}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 w-full max-w-6xl">
            {data?.map(tree => (
              <Link
                key={tree._id}
                href={`/dashboard/notes/${tree._id}`}
                className="transition-transform hover:scale-[1.02]"
              >
                <Card className="h-full hover:bg-muted/50 transition-colors">
                  <CardHeader>
                    <CardTitle className="text-xl">{tree.title}</CardTitle>
                    <CardDescription>
                      {tree.childNotes?.length || 0} nested note(s)
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </ConditionChecker>
      </ConditionChecker>

      <ConditionChecker condition={!!error}>
        <p>Error loading trees.</p>
      </ConditionChecker>

      <Dialog open={newTreeDialogOpen} onOpenChange={setNewTreeDialogOpen}>
        <DialogTrigger asChild>
          <Button>Create a new tree</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
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
    </div>
  );
}
