"use client";

import { useEffect, useMemo, useRef } from "react";
import { InputRule, Node, type Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import { Slice } from "@tiptap/pm/model";
import { CHAT_COMPOSER_MAX_HEIGHT_PX } from "@/constants/discussionConstants";

interface MarkdownComposerProps {
  value: string;
  placeholder: string;
  sending: boolean;
  disabled?: boolean;
  focusRequest?: number;
  onChange: (markdown: string) => void;
  onSubmit: () => void;
}

// The bullet shortcut has already consumed "- " when the checklist marker is typed.
const ComposerTaskItem = TaskItem.extend({
  addInputRules() {
    return [
      new InputRule({
        find: /^\[([ xX])\]\s$/,
        handler: ({ chain, range, match }) => {
          if (!this.editor.isActive("bulletList")) return null;
          chain().deleteRange(range).toggleTaskList().updateAttributes("taskItem", { checked: match[1].toLowerCase() === "x" }).run();
        },
      }),
      ...(this.parent?.() ?? []),
    ];
  },
});

// Preserve image Markdown without fetching remote images while someone edits a prompt.
const ImageSource = Node.create({
  name: "image",
  inline: true,
  group: "inline",
  atom: true,
  addAttributes() { return { source: { default: "" } }; },
  parseMarkdown(token) { return { type: "image", attrs: { source: token.raw } }; },
  renderMarkdown(node) { return node.attrs?.source ?? ""; },
  renderText({ node }) { return node.attrs.source; },
  renderHTML({ node }) { return ["span", { class: "chat-composer-image-source" }, node.attrs.source]; },
});

/** One editable formatted surface; only Markdown crosses the chat API boundary. */
export function MarkdownComposer({ value, placeholder, sending, disabled = false, focusRequest = 0, onChange, onSubmit }: MarkdownComposerProps) {
  const published = useRef(value);
  const extensions = useMemo(() => [
    StarterKit.configure({
      underline: false,
      // Grow only for content the user enters, not an automatic paragraph after a list.
      trailingNode: false,
      link: {
        openOnClick: false,
        defaultProtocol: "https",
        markdownLinks: true,
        isAllowedUri: (url, { defaultValidate }) => /^(?:https?:\/\/|mailto:)/i.test(url) && defaultValidate(url),
        HTMLAttributes: { rel: "noopener noreferrer" },
      },
    }),
    ComposerTaskItem.configure({ nested: true }),
    TaskList,
    TableKit.configure({ table: { resizable: false } }),
    Placeholder.configure({ placeholder }),
    ImageSource,
    Markdown.configure({ markedOptions: { gfm: true } }),
  ], [placeholder]);
  const editor: Editor | null = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions,
    content: value,
    contentType: "markdown",
    editorProps: {
      attributes: {
        class: "chat-composer-editor",
        role: "textbox",
        "aria-label": "Message",
        "aria-multiline": "true",
        "data-chat-text": "",
        spellcheck: "true",
      },
      handleKeyDown: (view, event) => {
        if (event.isComposing || view.composing || event.keyCode === 229 || event.key !== "Enter" || event.ctrlKey || event.metaKey || event.altKey) return false;
        if (!event.shiftKey) {
          event.preventDefault();
          if (!sending) onSubmit();
          return true;
        }
        if (!editor) return false;
        // Shift+Enter continues a list or exits an empty item, and keeps code multiline.
        if (editor.isActive("codeBlock")) return editor.commands.newlineInCode();
        const { $from, empty } = view.state.selection;
        const fence = empty && $from.parentOffset === $from.parent.content.size && $from.parent.type.name === "paragraph"
          ? /^(?:```|~~~)([\w+-]*)$/.exec($from.parent.textContent) : null;
        if (fence) {
          return editor.chain().deleteRange({ from: $from.start(), to: $from.end() }).setCodeBlock(fence[1] ? { language: fence[1] } : undefined).run();
        }
        const item = editor.isActive("taskItem") ? "taskItem" : editor.isActive("listItem") ? "listItem" : null;
        if (item) {
          return view.state.selection.$from.parent.content.size === 0
            ? editor.commands.liftListItem(item)
            : editor.commands.splitListItem(item);
        }
        return editor.commands.first(({ commands }) => [
          () => commands.createParagraphNear(),
          () => commands.liftEmptyBlock(),
          () => commands.splitBlock(),
        ]);
      },
      handlePaste: (view, event) => {
        if (!editor || !event.clipboardData) return false;
        const text = event.clipboardData.getData("text/plain");
        if (!text) return true;
        event.preventDefault();
        // Read plain clipboard text only; clipboard HTML and files never enter the editor.
        if (editor.isActive("codeBlock") || !text.trim()) {
          view.dispatch(view.state.tr.insertText(text.replace(/\r\n?/g, "\n")).scrollIntoView());
        } else {
          const document = editor.schema.nodeFromJSON(editor.storage.markdown.manager.parse(text));
          // Open the parsed block boundaries so inline pastes merge at the caret.
          const slice = Slice.maxOpen(document.content, false);
          view.dispatch(view.state.tr.replaceSelection(slice).setMeta("paste", true).setMeta("uiEvent", "paste").scrollIntoView());
        }
        return true;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false;
        // File and HTML drops are outside this text-only composer.
        if (event.dataTransfer?.files.length || event.dataTransfer?.types.includes("text/html")) {
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = current.isEmpty ? "" : current.getMarkdown();
      published.current = markdown;
      onChange(markdown);
    },
  });

  useEffect(() => {
    if (!editor || published.current === value) return;
    // Clearing after send, restoring a refused send, and dictation are external edits.
    // Ordinary typing never reparses the document or moves the caret.
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
    published.current = value;
    if (editor.isFocused) editor.commands.setTextSelection(editor.state.doc.content.size);
  }, [editor, value]);

  useEffect(() => { editor?.setEditable(!disabled, false); }, [editor, disabled]);

  useEffect(() => {
    if (editor && focusRequest > 0 && !disabled) editor.commands.focus("end");
  }, [editor, focusRequest, disabled]);

  return <EditorContent
    editor={editor}
    style={{ maxHeight: CHAT_COMPOSER_MAX_HEIGHT_PX }}
    className="min-h-8 min-w-0 flex-1 overflow-x-hidden overflow-y-auto text-xs text-slate-900 dark:text-slate-100"
  />;
}
