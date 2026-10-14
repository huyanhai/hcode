export function useDesktop() {
  const isDesktop = computed(() => Boolean(window.desktop));
  return { isDesktop };
}
