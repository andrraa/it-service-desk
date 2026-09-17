export function modal(node: HTMLDialogElement) {
  const previous = document.activeElement;
  node.showModal();
  return {
    destroy() {
      node.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    },
  };
}
