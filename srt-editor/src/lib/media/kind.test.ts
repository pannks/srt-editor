import { describe, expect, it } from "vitest";
import { classifyPath, extensionOf, firstOpenable } from "./kind";

describe("classifyPath", () => {
  it("recognises video, audio and subtitles regardless of case", () => {
    expect(classifyPath("/a/clip.MP4")).toBe("video");
    expect(classifyPath("/a/track.wav")).toBe("audio");
    expect(classifyPath("/a/subs.srt")).toBe("srt");
  });

  it("returns null for anything else", () => {
    expect(classifyPath("/a/notes.txt")).toBeNull();
    expect(classifyPath("/a/noextension")).toBeNull();
  });
});

describe("extensionOf", () => {
  it("ignores dots in the directory path", () => {
    expect(extensionOf("/a.b/clip")).toBe("");
    expect(extensionOf("/a.b/clip.mov")).toBe("mov");
  });
});

describe("firstOpenable", () => {
  it("picks the first path the app can open", () => {
    expect(firstOpenable(["/a/readme.md", "/a/clip.mkv", "/a/x.mp3"])).toBe(
      "/a/clip.mkv",
    );
  });

  it("is null when nothing is openable", () => {
    expect(firstOpenable(["/a/readme.md"])).toBeNull();
  });
});
