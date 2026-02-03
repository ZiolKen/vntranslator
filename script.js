document.addEventListener("contextmenu", e => e.preventDefault());

document.addEventListener("keydown", e => {
  if (
    e.key === "F12" ||
    (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key)) ||
    (e.ctrlKey && e.key === "U")
  ) {
    e.preventDefault();
  }
});

console.log('%c░██████╗████████╗░█████╗░██████╗░██╗\n██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██║\n╚█████╗░░░░██║░░░██║░░██║██████╔╝██║\n░╚═══██╗░░░██║░░░██║░░██║██╔═══╝░╚═╝\n██████╔╝░░░██║░░░╚█████╔╝██║░░░░░██╗\n╚═════╝░░░░╚═╝░░░░╚════╝░╚═╝░░░░░╚═╝', 'color: red; font-weight: bold;');