const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const cors = require('cors');
const session = require('express-session');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Configuración de sesión
app.use(session({
  secret: 'secretKey',
  resave: false,
  saveUninitialized: false,
}));

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Redirigir raíz a login.html
app.get('/', (req, res) => {
  if (req.session.userId) {
    res.sendFile(__dirname + '/public/index.html'); // página protegida
  } else {
    res.redirect('/login.html');
  }
});

// Servir archivos estáticos
app.use(express.static('public'));

// Conexión a MySQL
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '1V2l3X123!',
  database: 'mediciones'
});

db.connect(err => {
  if (err) {
    console.error('Error de conexión a MySQL:', err);
  } else {
    console.log('Conectado a MySQL');
  }
});

// Registro
app.post('/registro.html', async (req, res) => {
  const { nombre, correo, password } = req.body;

  db.query('SELECT * FROM doctores WHERE correo = ?', [correo], async (err, results) => {
    if (err) return res.status(500).send('Error en base de datos');
    if (results.length > 0) return res.status(400).send('Correo ya registrado');

    const hashedPassword = await bcrypt.hash(password, 10);

    db.query(
      'INSERT INTO doctores (nombre, correo, password) VALUES (?, ?, ?)',
      [nombre, correo, hashedPassword],
      (err) => {
        console.error('Error al registrar:', err);
        if (err) return res.status(500).send('Error al registrar');
        res.redirect('/login.html'); // redirige al login después del registro
      }
    );
  });
});


// Login
app.post('/login.html', (req, res) => {
  const { correo, password } = req.body;

  db.query('SELECT * FROM doctores WHERE correo = ?', [correo], async (err, results) => {
    if (err) return res.status(500).send('Error en base de datos');
    if (results.length === 0) return res.status(401).send('Correo no encontrado');

    const doctor = results[0];

    const match = await bcrypt.compare(password, doctor.password);

    if (match) {
      req.session.userId = doctor.id;
      res.redirect('/');
    } else {
      res.status(401).send('Contraseña incorrecta');
    }
  });
});

// Cerrar sesión
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login.html');
});

const path = require('path');

app.get('/verpacientes', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'verpacientes.html'));
});


app.get('/pacientes', (req, res) => {
  const doctor_id = req.session.userId;

  if (!doctor_id) {
    return res.status(403).send('No autorizado');
  }

  const sql = `
    SELECT pacientes.*, doctores.nombre AS nombre_doctor
    FROM pacientes
    JOIN doctores ON pacientes.doctor_id = doctores.id
    WHERE pacientes.doctor_id = ?
    ORDER BY pacientes.fecha_consul DESC
  `;

  db.query(sql, [doctor_id], (err, results) => {
    if (err) {
      console.error('Error al obtener pacientes:', err);
      return res.status(500).send('Error al obtener pacientes');
    }

    res.json(results);
  });
});


app.post('/guardar-medicion', (req, res) => {
  const { nombre, sexo, edad, fecha_consul, temperatura, pulso } = req.body;
  const doctor_id = req.session.userId;

  if (!doctor_id) {
    return res.status(403).send('No autorizado');
  }

  const sql = `
    INSERT INTO pacientes (nombre, sexo, edad, fecha_consul, doctor_id, temperatura, pulso)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [nombre, sexo, edad, fecha_consul, doctor_id, temperatura, pulso];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error al guardar paciente:", err);
      return res.status(500).send("Error al guardar paciente");
    }
    res.send("Paciente guardado correctamente");
  });
});



// WebSocket
io.on('connection', (socket) => {
  console.log('Nuevo dispositivo conectado.');

  socket.on('data', (data) => {
    console.log(`Datos del ESP32: ${data}`);
  });

  socket.on('desde_cliente', (data) => {
    console.log(`Desde página: ${data}`);
    io.sockets.emit("desde_servidor_comando", data);
  });

  socket.on('desde_esp32', (data) => {
    console.log("ESP32:", data);
    io.sockets.emit("retransmision_esp32", data);
  });

  socket.on('disconnect', () => {
    console.log('Dispositivo desconectado.');
  });
});

// Iniciar servidor
server.listen(3000, () => {
  console.log('Servidor escuchando en puerto 3000');
});
