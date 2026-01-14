    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const particleCount = isMobile ? 60 : 111;

    particlesJS("particles-js", {
      "particles": {
        "number": { "value": particleCount, "density": { "enable": true, "value_area": 950 } },
        "color": { "value": "#a855f7" },
        "shape": { "type": "circle", "stroke": { "width": 0, "color": "#000" } },
        "opacity": { "value": 0.40, "random": true, "anim": { "enable": false } },
        "size": { "value": 2.1, "random": true, "anim": { "enable": false } },
        "line_linked": { "enable": true, "distance": 160, "color": "#a855f7", "opacity": 0.16, "width": 1 },
        "move": { "enable": true, "speed": 0.75, "direction": "none", "random": false, "straight": false, "out_mode": "out", "bounce": false }
      },
      "interactivity": {
        "detect_on": "canvas",
        "events": { "onhover": { "enable": true, "mode": "repulse" }, "onclick": { "enable": false }, "resize": true },
        "modes": { "repulse": { "distance": 90, "duration": 0.35 } }
      },
      "retina_detect": true
    });