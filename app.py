from flask import Flask, render_template, request, redirect, url_for, session, jsonify, send_from_directory
from flask_session import Session
from flask_socketio import SocketIO, emit, join_room, leave_room
import sqlite3
import hashlib
import os
import uuid
from datetime import datetime, timedelta
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = 'your_secret_key_here_change_in_production'
app.config['SESSION_TYPE'] = 'filesystem'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024
app.config['ALLOWED_EXTENSIONS'] = {'png', 'jpg', 'jpeg', 'gif'}
Session(app)
socketio = SocketIO(app, cors_allowed_origins="*", manage_session=False)

online_users = {}

def init_db():
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'offline'
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        bio TEXT,
        avatar TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER NOT NULL,
        receiver_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_read INTEGER DEFAULT 0,
        FOREIGN KEY (sender_id) REFERENCES users (id),
        FOREIGN KEY (receiver_id) REFERENCES users (id)
    )
    ''')
    
    conn.commit()
    conn.close()

def get_db_connection():
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

@app.before_request
def make_session_permanent():
    session.permanent = True

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/check-auth')
def check_auth():
    if 'user_id' in session:
        conn = get_db_connection()
        user = conn.execute('SELECT * FROM users WHERE id = ?', (session['user_id'],)).fetchone()
        profile = conn.execute('SELECT * FROM profiles WHERE user_id = ?', (session['user_id'],)).fetchone()
        conn.close()
        
        if user:
            return jsonify({
                'authenticated': True,
                'username': user['username'],
                'user_id': user['id'],
                'profile': {
                    'bio': profile['bio'] if profile else '',
                    'avatar': profile['avatar'] if profile else '/static/default-avatar.png'
                } if profile else None
            })
    
    return jsonify({'authenticated': False})

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        conn = get_db_connection()
        user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
        conn.close()
        
        if user and user['password_hash'] == hash_password(password):
            session['user_id'] = user['id']
            session['username'] = user['username']
            
            conn = get_db_connection()
            conn.execute('UPDATE users SET last_seen = ?, status = ? WHERE id = ?', 
                        (datetime.now(), 'online', user['id']))
            conn.commit()
            conn.close()
            
            return jsonify({'success': True, 'message': 'login successful'})
        else:
            return jsonify({'success': False, 'message': 'invalid'})
    
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        conn = get_db_connection()
        
        existing_user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
        if existing_user:
            conn.close()
            return jsonify({'success': False, 'message': 'username taken'})
        
        password_hash = hash_password(password)
        cursor = conn.cursor()
        cursor.execute('INSERT INTO users (username, password_hash) VALUES (?, ?)', (username, password_hash))
        user_id = cursor.lastrowid
        
        cursor.execute('INSERT INTO profiles (user_id, bio, avatar) VALUES (?, ?, ?)',
                      (user_id, '', '/static/default-avatar.png'))
        
        conn.commit()
        conn.close()
        
        session['user_id'] = user_id
        session['username'] = username
        
        return jsonify({'success': True, 'message': 'registration successful'})
    
    return render_template('register.html')

@app.route('/profile', methods=['GET', 'POST'])
def profile():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    if request.method == 'POST':
        bio = request.form.get('bio')
        avatar_url = request.form.get('avatar')
        
        conn = get_db_connection()
        
        if 'avatar' in request.files:
            file = request.files['avatar']
            if file and file.filename != '' and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                unique_filename = f"{uuid.uuid4().hex}_{filename}"
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
                file.save(filepath)
                avatar_url = f"/static/uploads/{unique_filename}"
        
        conn.execute('''
            UPDATE profiles 
            SET bio = ?, avatar = ?
            WHERE user_id = ?
        ''', (bio, avatar_url, session['user_id']))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'profile updated'})
    
    return render_template('profile.html')

@app.route('/players')
def players():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('players.html')

@app.route('/messages')
def messages():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('messages.html')

@app.route('/api/profile')
def get_profile():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    conn = get_db_connection()
    profile = conn.execute('SELECT * FROM profiles WHERE user_id = ?', (session['user_id'],)).fetchone()
    conn.close()
    
    if profile:
        return jsonify(dict(profile))
    return jsonify({'error': 'profile not found'}), 404

@app.route('/api/players')
def get_players():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    conn = get_db_connection()
    users = conn.execute('''
        SELECT u.id, u.username, u.status, u.last_seen, p.avatar 
        FROM users u 
        LEFT JOIN profiles p ON u.id = p.user_id 
        WHERE u.id != ?
        ORDER BY u.status DESC, u.username
    ''', (session['user_id'],)).fetchall()
    
    players_list = []
    for user in users:
        players_list.append({
            'id': user['id'],
            'username': user['username'],
            'status': user['status'],
            'last_seen': user['last_seen'],
            'avatar': user['avatar'] if user['avatar'] else '/static/default-avatar.png'
        })
    
    conn.close()
    return jsonify(players_list)

@app.route('/api/user/<int:user_id>')
def get_user(user_id):
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    conn = get_db_connection()
    user = conn.execute('''
        SELECT u.id, u.username, u.status, u.last_seen, p.bio, p.avatar 
        FROM users u 
        LEFT JOIN profiles p ON u.id = p.user_id 
        WHERE u.id = ?
    ''', (user_id,)).fetchone()
    
    if user:
        result = {
            'id': user['id'],
            'username': user['username'],
            'status': user['status'],
            'last_seen': user['last_seen'],
            'bio': user['bio'],
            'avatar': user['avatar'] if user['avatar'] else '/static/default-avatar.png'
        }
        conn.close()
        return jsonify(result)
    
    conn.close()
    return jsonify({'error': 'User not found'}), 404

@app.route('/api/messages')
def get_messages():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    other_user_id = request.args.get('user_id')
    if not other_user_id:
        return jsonify({'error': 'user id required'}), 400
    
    conn = get_db_connection()
    messages = conn.execute('''
        SELECT m.*, u.username as sender_name, p.avatar as sender_avatar
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        LEFT JOIN profiles p ON m.sender_id = p.user_id
        WHERE (m.sender_id = ? AND m.receiver_id = ?) 
           OR (m.sender_id = ? AND m.receiver_id = ?)
        ORDER BY m.timestamp ASC
    ''', (session['user_id'], other_user_id, other_user_id, session['user_id'])).fetchall()
    
    messages_list = []
    for msg in messages:
        messages_list.append({
            'id': msg['id'],
            'sender_id': msg['sender_id'],
            'receiver_id': msg['receiver_id'],
            'message': msg['message'],
            'timestamp': msg['timestamp'],
            'is_read': bool(msg['is_read']),
            'sender_name': msg['sender_name'],
            'sender_avatar': msg['sender_avatar'] if msg['sender_avatar'] else '/static/default-avatar.png',
            'is_own': msg['sender_id'] == session['user_id']
        })
    
    conn.execute('UPDATE messages SET is_read = 1 WHERE receiver_id = ? AND sender_id = ? AND is_read = 0', 
                (session['user_id'], other_user_id))
    conn.commit()
    conn.close()
    
    return jsonify(messages_list)

@app.route('/api/conversations')
def get_conversations():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    conn = get_db_connection()
    
    conversations = conn.execute('''
        SELECT DISTINCT
            u.id as user_id,
            u.username,
            p.avatar,
            (SELECT MAX(timestamp) FROM messages 
             WHERE (sender_id = ? AND receiver_id = u.id) 
                OR (receiver_id = ? AND sender_id = u.id)) as last_message_time,
            (SELECT message FROM messages 
             WHERE ((sender_id = ? AND receiver_id = u.id) 
                OR (receiver_id = ? AND sender_id = u.id))
             ORDER BY timestamp DESC LIMIT 1) as last_message,
            (SELECT COUNT(*) FROM messages 
             WHERE receiver_id = ? AND sender_id = u.id AND is_read = 0) as unread_count
        FROM users u
        LEFT JOIN profiles p ON u.id = p.user_id
        WHERE u.id != ? AND u.id IN (
            SELECT DISTINCT sender_id FROM messages WHERE receiver_id = ?
            UNION
            SELECT DISTINCT receiver_id FROM messages WHERE sender_id = ?
        )
        ORDER BY last_message_time DESC NULLS LAST
    ''', (session['user_id'], session['user_id'], session['user_id'], session['user_id'], 
          session['user_id'], session['user_id'], session['user_id'], session['user_id'])).fetchall()
    
    conversations_list = []
    for conv in conversations:
        conversations_list.append({
            'user_id': conv['user_id'],
            'username': conv['username'],
            'avatar': conv['avatar'] if conv['avatar'] else '/static/default-avatar.png',
            'last_message': conv['last_message'],
            'last_message_time': conv['last_message_time'],
            'unread_count': conv['unread_count'] or 0
        })
    
    conn.close()
    return jsonify(conversations_list)

@app.route('/logout')
def logout():
    if 'user_id' in session:
        user_id = session['user_id']
        conn = get_db_connection()
        conn.execute('UPDATE users SET status = ?, last_seen = ? WHERE id = ?', 
                    ('offline', datetime.now(), user_id))
        conn.commit()
        conn.close()
        
        if user_id in online_users:
            del online_users[user_id]
    
    session.clear()
    return redirect(url_for('index'))

@socketio.on('connect')
def handle_connect():
    if 'user_id' in session:
        user_id = session['user_id']
        username = session['username']
        online_users[user_id] = {
            'username': username,
            'sid': request.sid
        }
        
        conn = get_db_connection()
        conn.execute('UPDATE users SET status = ? WHERE id = ?', ('online', user_id))
        conn.commit()
        conn.close()
        
        emit('user_status', {'user_id': user_id, 'status': 'online'}, broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    if 'user_id' in session:
        user_id = session['user_id']
        if user_id in online_users:
            del online_users[user_id]
        
        conn = get_db_connection()
        conn.execute('UPDATE users SET status = ?, last_seen = ? WHERE id = ?', 
                    ('offline', datetime.now(), user_id))
        conn.commit()
        conn.close()
        
        emit('user_status', {'user_id': user_id, 'status': 'offline'}, broadcast=True)

@socketio.on('private_message')
def handle_private_message(data):
    sender_id = session['user_id']
    receiver_id = data['receiver_id']
    message = data['message']
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO messages (sender_id, receiver_id, message) 
        VALUES (?, ?, ?)
    ''', (sender_id, receiver_id, message))
    conn.commit()
    
    msg_id = cursor.lastrowid
    
    sender_profile = conn.execute('SELECT avatar FROM profiles WHERE user_id = ?', (sender_id,)).fetchone()
    sender_avatar = sender_profile['avatar'] if sender_profile and sender_profile['avatar'] else '/static/default-avatar.png'
    
    conn.close()
    
    message_data = {
        'id': msg_id,
        'sender_id': sender_id,
        'receiver_id': receiver_id,
        'message': message,
        'timestamp': datetime.now().isoformat(),
        'sender_name': session['username'],
        'sender_avatar': sender_avatar,
        'is_own': False
    }
    
    emit('new_message', message_data, room=request.sid)
    
    if receiver_id in online_users:
        receiver_sid = online_users[receiver_id]['sid']
        message_data['is_own'] = True
        emit('new_message', message_data, room=receiver_sid)

@socketio.on('typing')
def handle_typing(data):
    receiver_id = data['receiver_id']
    if receiver_id in online_users:
        receiver_sid = online_users[receiver_id]['sid']
        emit('user_typing', {
            'user_id': session['user_id'],
            'username': session['username']
        }, room=receiver_sid)

@socketio.on('stop_typing')
def handle_stop_typing(data):
    receiver_id = data['receiver_id']
    if receiver_id in online_users:
        receiver_sid = online_users[receiver_id]['sid']
        emit('user_stop_typing', {
            'user_id': session['user_id']
        }, room=receiver_sid)

if __name__ == '__main__':
    init_db()
    if not os.path.exists('static'):
        os.makedirs('static')
    if not os.path.exists(app.config['UPLOAD_FOLDER']):
        os.makedirs(app.config['UPLOAD_FOLDER'])
    socketio.run(app, debug=True, port=5000)