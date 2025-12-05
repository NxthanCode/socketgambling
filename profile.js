document.addEventListener('DOMContentLoaded', function() {
    loadProfileData();
    initializeProfileForm();
});

function loadProfileData() {
    fetch('/api/profile')
        .then(response => {
            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/login';
                }
                throw new Error('profile data loading failed');
            }
            return response.json();
        })
        .then(profile => {
            document.getElementById('bio').value = profile.bio || '';
            
            if (profile.avatar) {
                updateAvatarPreview(profile.avatar);
            }
            
            fetch('/api/check-auth')
                .then(response => response.json())
                .then(data => {
                    if (data.authenticated) {
                        document.getElementById('username').value = data.username;
                    }
                });
        })
        .catch(error => {
            console.error('Error:', error);
            showMessage('failed to load profile data', 'error');
        });
}

function initializeProfileForm() {
    const form = document.getElementById('profileForm');
    const resetBtn = document.getElementById('resetBtn');
    const fileInput = document.getElementById('avatarFile');
    
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const fileInfo = document.getElementById('fileInfo');
            fileInfo.textContent = file.name;
            
            if (file.size > 2 * 1024 * 1024) {
                showMessage('file size to low', 'error');
                fileInput.value = '';
                fileInfo.textContent = 'no file selected';
                return;
            }
            
            const validExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
            const fileName = file.name.toLowerCase();
            const isValidExtension = validExtensions.some(ext => fileName.endsWith(ext));
            
            if (!isValidExtension) {
                showMessage('not a valid extension', 'error');
                fileInput.value = '';
                fileInfo.textContent = 'no file selected';
                return;
            }
            
            const reader = new FileReader();
            reader.onload = function(e) {
                updateAvatarPreview(e.target.result);
            };
            reader.readAsDataURL(file);
        }
    });
    
    form.addEventListener('submit', handleProfileUpdate);
    
    resetBtn.addEventListener('click', function() {
        if (confirm('reset all changes?')) {
            loadProfileData();
            fileInput.value = '';
            document.getElementById('fileInfo').textContent = 'no file selected';
            showMessage('changes reset', 'success');
        }
    });
}

function handleProfileUpdate(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> saving...';
    submitBtn.disabled = true;
    
    const preview = document.getElementById('avatarPreview');
    preview.classList.add('loading');
    
    fetch('/profile', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        preview.classList.remove('loading');
        
        if (data.success) {
            showMessage(data.message, 'success');
            
            const fileInput = document.getElementById('avatarFile');
            if (fileInput.files.length > 0) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    updateAvatarPreview(e.target.result);
                };
                reader.readAsDataURL(fileInput.files[0]);
                
                fileInput.value = '';
                document.getElementById('fileInfo').textContent = 'no file selected';
            }
        } else {
            showMessage('failed to save profile', 'error');
        }
        
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    })
    .catch(error => {
        console.error('Error:', error);
        preview.classList.remove('loading');
        showMessage('please try again.', 'error');
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    });
}

function updateAvatarPreview(src) {
    const avatarImage = document.getElementById('avatarImage');
    avatarImage.src = src;
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

const defaultAvatar = document.createElement('img');
defaultAvatar.src = '/static/default-avatar.png';
defaultAvatar.style.display = 'none';
document.head.appendChild(defaultAvatar);