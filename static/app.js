
document.addEventListener('DOMContentLoaded', function() {
    simulateLoading();
});

function simulateLoading() {
    const loader = document.getElementById('loader-container');
    
    setTimeout(() => {
        checkAuthentication();
        
        loader.style.opacity = '0';
        
        setTimeout(() => {
            loader.classList.add('hidden');
        }, 500);
        
    }, 2500);
}

function checkAuthentication() {
    fetch('/api/check-auth')
        .then(response => response.json())
        .then(data => {
            if (data.authenticated) {
                window.location.href = '/profile';
            } else {
                window.location.href = '/login';
            }
        })
        .catch(error => {
            console.error('auth check error:', error);
            window.location.href = '/login';
        });
}

document.addEventListener('contextmenu', function(e) {
    if (e.target.nodeName === 'IMG') {
        e.preventDefault();
    }
});
