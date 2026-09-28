export function truncateFileNameSafe(
  fileName: string,
  maxLength = 20,
  ellipsis = "...",
) {
  const chars = Array.from(fileName);
  if (chars.length <= maxLength) return fileName;

  const lastDotIndex = fileName.lastIndexOf(".");
  let nameChars = chars;
  let extChars: string[] = [];

  if (lastDotIndex > 0 && lastDotIndex < fileName.length - 1) {
    // 按码点重新定位扩展名位置
    const nameStr = fileName.slice(0, lastDotIndex);
    nameChars = Array.from(nameStr);
    extChars = Array.from(fileName.slice(lastDotIndex));
  }

  const availableLength = maxLength - ellipsis.length - extChars.length;
  if (availableLength <= 0) {
    const half = Math.floor((maxLength - ellipsis.length) / 2);
    return (
      chars.slice(0, half).join("") +
      ellipsis +
      chars.slice(-(maxLength - ellipsis.length - half)).join("")
    );
  }

  const frontLength = Math.ceil(availableLength / 2);
  const backLength = Math.floor(availableLength / 2);

  return (
    nameChars.slice(0, frontLength).join("") +
    ellipsis +
    nameChars.slice(-backLength).join("") +
    extChars.join("")
  );
}
