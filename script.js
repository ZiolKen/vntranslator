const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const particleCount = isMobile ? 70 : 120;
particlesJS("particles-js", {
  "particles": {
    "number": { "value": particleCount, "density": { "enable": true, "value_area": 800 } },
    "color": { "value": "#a855f7" },
    "shape": { "type": "circle", "stroke": { "width": 0, "color": "#000" } },
    "opacity": { "value": 0.7, "random": true, "anim": { "enable": true, "speed": 0.5, "opacity_min": 0.3, "sync": false } },
    "size": { "value": 3, "random": true, "anim": { "enable": true, "speed": 2, "size_min": 0.3, "sync": false } },
    "line_linked": { "enable": true, "distance": 150, "color": "#a855f7", "opacity": 0.3, "width": 1 },
    "move": { "enable": true, "speed": 1.5, "direction": "none", "random": false, "straight": false, "out_mode": "out", "bounce": false }
  },
  "interactivity": {
    "detect_on": "canvas",
    "events": { "onhover": { "enable": true, "mode": "repulse" }, "onclick": { "enable": false }, "resize": true },
    "modes": { "repulse": { "distance": 100, "duration": 0.4 } }
  },
  "retina_detect": true
});

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