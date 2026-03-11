function animateTypewriter(element, text, speed = 30) {
    if (!element) return;
    element.textContent = '';
    let i = 0;
    const timer = setInterval(() => {
        if (!element.isConnected) {
            clearInterval(timer);
            return;
        }
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
        } else {
            clearInterval(timer);
        }
    }, speed);
}




