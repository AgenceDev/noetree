"use client";

import NoteTree from "@/components/NotesTree";
import NoteContent from "@/components/NoteContent";
import { EditorProvider } from "@/providers/EditorProvider";
import { TreeProvider } from "@/providers/TreeProvider";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from "@/components/ui/resizable";

const NotePageContent = () => {
  return (
    <EditorProvider>
      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId="autoSaveNotePageResizablePanel"
      >
        <ResizablePanel
          defaultSize={40}
          minSize={20}
          className="p-4 !overflow-y-auto"
        >
          <NoteTree />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel
          defaultSize={60}
          minSize={40}
          className="p-4 !overflow-y-auto"
        >
          <NoteContent />
        </ResizablePanel>
      </ResizablePanelGroup>
    </EditorProvider>
  );
};

export default function NotePage() {
  return (
    <TreeProvider>
      <NotePageContent />
    </TreeProvider>
  );
}
