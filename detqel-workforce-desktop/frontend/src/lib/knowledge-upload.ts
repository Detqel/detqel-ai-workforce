/** The request body for uploading a file as discussion knowledge: Word documents travel as base64, everything else as text. */
export async function readKnowledgeUpload(file: File): Promise<{ fileName: string; mimeType: string; content: string; encoding: "utf8" | "base64" }> {
  if (file.name.toLowerCase().endsWith(".docx")) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return { fileName: file.name, mimeType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document", content: btoa(binary), encoding: "base64" };
  }
  return { fileName: file.name, mimeType: file.type || "text/plain", content: await file.text(), encoding: "utf8" };
}
