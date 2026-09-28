import assert from "node:assert/strict";
import test from "node:test";
import { inputMessages } from "../dist/index.js";

test("maps ImageKit attachments to Responses input parts", () => {
  const [message] = inputMessages([
    {
      role: "user",
      content: "请分析这些文件",
      attachments: [
        { url: "https://ik.imagekit.io/hyh/photo.png", name: "photo.png", mimeType: "image/png" },
        { url: "https://ik.imagekit.io/hyh/report.pdf", name: "report.pdf", mimeType: "application/pdf" },
        { url: "https://ik.imagekit.io/hyh/report.docx", name: "report.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      ],
    },
  ]);

  assert.deepEqual(message, {
    role: "user",
    content: [
      { type: "input_text", text: "请分析这些文件" },
      { type: "input_image", image_url: "https://ik.imagekit.io/hyh/photo.png", detail: "auto" },
      { type: "input_file", file_url: "https://ik.imagekit.io/hyh/report.pdf", filename: "report.pdf", detail: "auto" },
      { type: "input_file", file_url: "https://ik.imagekit.io/hyh/report.docx", filename: "report.docx", detail: "auto" },
    ],
  });
});

test("uses inline data for providers that cannot fetch file URLs", () => {
  const [message] = inputMessages([
    {
      role: "user",
      content: "总结文件",
      attachments: [
        {
          url: "https://ik.imagekit.io/hyh/report.pdf",
          dataUrl: "data:application/pdf;base64,ZmFrZQ==",
          name: "report.pdf",
          mimeType: "application/pdf",
        },
      ],
    },
  ]);

  assert.deepEqual(message.content[1], {
    type: "input_file",
    file_data: "data:application/pdf;base64,ZmFrZQ==",
    filename: "report.pdf",
    detail: "auto",
  });
});
