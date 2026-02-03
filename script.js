document.addEventListener('DOMContentLoaded', function() {
    const floatingContainer = document.getElementById('floatingElements');
    const elementCount = 15;
    for (let i = 0; i < elementCount; i++) {
        const element = document.createElement('div');
        element.classList.add('floating-element');
        const size = Math.random() * 40 + 10;
        const posX = Math.random() * 100;
        const delay = Math.random() * 10;
        const duration = Math.random() * 20 + 10;
        element.style.width = `${size}px`;
        element.style.height = `${size}px`;
        element.style.left = `${posX}%`;
        element.style.top = `100vh`;
        element.style.animationDuration = `${duration}s`;
        element.style.animationDelay = `${delay}s`;
        if (Math.random() > 0.5) {
            element.style.borderRadius = '10%';
            element.style.transform = `rotate(${Math.random() * 360}deg)`;
        }
        const colors = [
            'rgba(0, 243, 255, 0.1)',
            'rgba(123, 44, 191, 0.1)',
            'rgba(255, 42, 109, 0.1)'
        ];
        element.style.background = colors[Math.floor(Math.random() * colors.length)];
        floatingContainer.appendChild(element);
    }
    const card = document.querySelector('.card');
    const header = document.querySelector('h1');
    document.addEventListener('mousemove', (e) => {
        const x = e.clientX / window.innerWidth;
        const y = e.clientY / window.innerHeight;
        card.style.transform = `translate(${x * 10 - 5}px, ${y * 10 - 5}px)`;
        if (Math.random() > 0.995) {
            header.classList.add('glitch');
            setTimeout(() => {
                header.classList.remove('glitch');
            }, 200);
        }
    });
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