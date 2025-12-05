document.addEventListener('DOMContentLoaded', function() {
    initializeAuthForms();
});

function initializeAuthForms() {
    const toggleButtons = document.querySelectorAll('.toggle-password');
    toggleButtons.forEach(button => {
        button.addEventListener('click', function() {
            const input = this.parentElement.querySelector('input');
            const icon = this.querySelector('i');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        });
    });
    
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
}

function handleLogin(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = {
        username: form.username.value.trim(),
        password: form.password.value
    };
    
    if (!formData.username || !formData.password) {
        showMessage('Please fill all fields', 'error');
        return;
    }
    
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> signing in...';
    submitBtn.disabled = true;
    
    fetch('/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage(data.message, 'success');
            setTimeout(() => {
                window.location.href = '/profile';
            }, 1500);
        } else {
            showMessage(data.message, 'error');
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showMessage('please try again', 'error');
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    });
}

function handleRegister(e) {
    e.preventDefault();
    
    const form = e.target;
    const password = form.password.value;
    const confirmPassword = form.confirmPassword.value;
    
    if (!form.username.value.trim() || !password || !confirmPassword) {
        showMessage('please fill all fields', 'error');
        return;
    }
    
    if (form.username.value.trim().length < 3) {
        showMessage('username must be atleast 3 letters', 'error');
        return;
    }
    
    if (password.length < 6) {
        showMessage('password must be 6 letters or digits', 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        showMessage('passwords do not match', 'error');
        return;
    }
    
    const formData = {
        username: form.username.value.trim(),
        password: password
    };
    
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> creating account...';
    submitBtn.disabled = true;
    
    fetch('/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage(data.message, 'success');
            setTimeout(() => {
                window.location.href = '/profile';
            }, 1500);
        } else {
            showMessage(data.message, 'error');
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showMessage('please try again.', 'error');
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    });
}

function showMessage(text, type = 'info') {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.classList.remove('hidden');
    
    setTimeout(() => {
        messageDiv.classList.add('hidden');
    }, 5000);
}

document.body.classList.add('fade-in');
