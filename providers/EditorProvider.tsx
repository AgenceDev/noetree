import { Editor } from "@tiptap/core";
import { Content, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useDebouncedCallback } from "use-debounce";
import { useTreeContext } from "./TreeProvider";

const editorConfig = {
  content: "",
  extensions: [
    StarterKit,
    Placeholder.configure({
      placeholder: "Write something…",
    }),
    Link,
    Image,
  ],
  editorProps: {
    attributes: {
      class: "flex-1 overflow-y-auto border rounded-md p-4",
    },
  },
  immediatelyRender: false,
};

type saveStatusType = "idle" | "unsaved" | "saving" | "success" | "error";

interface EditorContextType {
  editor: Editor | null;
  saveStatus: saveStatusType;
  getCurrentContent: () => string | null;
}

const EditorContext = createContext<EditorContextType>({
  editor: null,
  saveStatus: "idle",
  getCurrentContent: () => null,
});

export const useEditorContext = (): EditorContextType => {
  const context = useContext(EditorContext);
  if (!context)
    throw new Error("useEditorContext must be used within an EditorProvider");
  return context;
};

interface EditorProviderProps {
  children: ReactNode;
}

export function EditorProvider({ children }: Readonly<EditorProviderProps>) {
  const { selectedNote, onUpdateNoteContent } = useTreeContext();

  const [saveStatus, setSaveStatus] = useState<saveStatusType>("idle");

  let initialContent: any = "";
  try {
    if (selectedNote?.content && typeof selectedNote.content === "string") {
      initialContent = JSON.parse(selectedNote.content);
    } else if (selectedNote?.content) {
      initialContent = selectedNote.content;
    }
  } catch (error) {
    console.warn("Failed to parse note content, using empty content:", error);
  }

  let editor = useEditor(
    {
      ...editorConfig,
      content: initialContent,
    },
    [selectedNote?._id],
  );

  const saveContent = useCallback(
    async (content: Content) => {
      if (!selectedNote) return;

      try {
        setSaveStatus("saving");

        onUpdateNoteContent(JSON.stringify(content));

        setSaveStatus("success");

        setTimeout(() => {
          setSaveStatus(currentStatus =>
            currentStatus === "success" ? "idle" : currentStatus,
          );
        }, 2000);
      } catch (error) {
        console.error("Failed to save note content", error);
        setSaveStatus("error");
      }
    },
    [selectedNote, onUpdateNoteContent],
  );

  const debouncedSave = useDebouncedCallback(saveContent, 3000);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        if (editor && saveStatus === "unsaved") {
          debouncedSave.cancel();
          saveContent(editor.getJSON());
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [editor, saveStatus, debouncedSave, saveContent]);

  useEffect(() => {
    if (!editor) return;

    debouncedSave.cancel();

    if (!selectedNote) {
      if (editor.getText() !== "") {
        editor.commands.setContent("");
      }
      return;
    }

    let content = "";
    try {
      if (selectedNote.content && typeof selectedNote.content === "string") {
        if (selectedNote.content.trim() === "") {
          content = "";
        } else {
          content = JSON.parse(selectedNote.content);
        }
      } else if (selectedNote.content) {
        content = selectedNote.content;
      }
    } catch (error) {
      console.warn("Failed to parse note content, using empty content:", error);
      content = "";
    }

    const currentJSON = JSON.stringify(editor.getJSON());
    const incomingJSON =
      typeof content === "string" ? content : JSON.stringify(content);

    if (currentJSON === incomingJSON) return;

    editor.commands.setContent(content, false);

    setSaveStatus("idle");
  }, [editor, selectedNote?._id, selectedNote?.content, debouncedSave]);

  useEffect(() => {
    if (!editor || !selectedNote) return;

    const updateListener = ({ editor }: { editor: Editor }) => {
      setSaveStatus("unsaved");
      debouncedSave(editor.getJSON());
    };

    editor.on("update", updateListener);

    return () => {
      if (editor) {
        editor.off("update", updateListener);
      }
    };
  }, [editor, selectedNote, debouncedSave]);

  const getCurrentContent = () => {
    if (!editor) return null;
    return JSON.stringify(editor.getJSON());
  };

  const contextValue = {
    editor,
    saveStatus,
    getCurrentContent,
  };

  return (
    <EditorContext.Provider value={contextValue}>
      {children}
    </EditorContext.Provider>
  );
}
