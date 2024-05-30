const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const { Pool } = require('pg');

const port = 3000;
const app = express();
const dbConfig = require('./config');
const db = new Pool(dbConfig);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true
}));

app.get('/', (req, res) => {
    res.render('index', { nombre: req.session.nombre });
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {
    const { nombre, email, contraseña } = req.body;

    try {
        const result = await db.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (result.rows.length > 0) {
            return res.send('El email ya está registrado');
        } else {
            await db.query('INSERT INTO usuarios (nombre, email, contraseña) VALUES ($1, $2, $3)', 
                [nombre, email, contraseña]);
            res.redirect('/login');
        }
    } catch (err) {
        console.error('Error during registration:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    const { email, contraseña } = req.body;

    try {
        const result = await db.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            if (contraseña === user.contraseña) {
                req.session.loggedin = true;
                req.session.nombre = user.nombre;
                req.session.userId = user.id;
                req.session.isAdmin = user.is_admin;
                res.redirect('/');
            } else {
                res.send('Contraseña incorrecta!');
            }
        } else {
            res.send('Usuario no encontrado!');
        }
    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/admin', (req, res) => {
    if (!req.session.loggedin || !req.session.isAdmin) {
        return res.redirect('/login');
    }
    db.query('SELECT * FROM pqrssi', (err, results) => {
        if (err) throw err;
        res.render('admin', { pqrssi: results.rows });
    });
});

app.post('/admin/change-status', (req, res) => {
    if (!req.session.loggedin || !req.session.isAdmin) {
        return res.redirect('/login');
    }
    const { pqrssi_id, estado_id, comentario } = req.body;
    const comentarioCompleto = `Estado cambiado por administrador: ${comentario}`;

    console.log('Datos recibidos:', { pqrssi_id, estado_id, comentario });

    db.query('UPDATE pqrssi SET estado_id = $1 WHERE id = $2', [estado_id, pqrssi_id], (err) => {
        if (err) throw err;

        db.query('INSERT INTO historial (pqrssi_id, estado_id, comentario) VALUES ($1, $2, $3)', 
            [pqrssi_id, estado_id, comentarioCompleto], 
            (err) => {
                if (err) throw err;
                console.log('Comentario almacenado:', comentarioCompleto);
                res.redirect('/admin');
            }
        );
    });
});

app.get('/submit', (req, res) => {
    if (!req.session.loggedin) {
        return res.redirect('/login');
    }
    db.query('SELECT * FROM categorias', (err, results) => {
        if (err) throw err;
        res.render('submit', { categorias: results.rows });
    });
});

app.post('/submit', (req, res) => {
    if (!req.session.loggedin) {
        return res.redirect('/login');
    }
    const { tipo, descripcion, categoria_id } = req.body;
    const usuario_id = req.session.userId;
    const estado_id = 1;

    db.query('INSERT INTO pqrssi (tipo, descripcion, usuario_id, estado_id, categoria_id) VALUES ($1, $2, $3, $4, $5)', 
        [tipo, descripcion, usuario_id, estado_id, categoria_id], 
        (err, result) => {
            if (err) throw err;

            db.query('INSERT INTO historial (pqrssi_id, estado_id, comentario) VALUES ($1, $2, $3)', 
                [result.rows[0].id, estado_id, 'Solicitud creada'], 
                (err) => {
                    if (err) throw err;
                    res.redirect('/');
                }
            );
        }
    );
});

app.get('/view', (req, res) => {
    if (!req.session.loggedin) {
        return res.redirect('/login');
    }
    db.query(`
        SELECT p.id, p.tipo, p.descripcion, e.nombre AS estado, p.fecha, c.nombre AS categoria, u.nombre AS usuario
        FROM pqrssi p
        JOIN estados e ON p.estado_id = e.id
        JOIN categorias c ON p.categoria_id = c.id
        JOIN usuarios u ON p.usuario_id = u.id
    `, (err, results) => {
        if (err) throw err;
        res.render('view', { pqrssi: results.rows });
    });
});

app.get('/historial/:pqrssi_id', (req, res) => {
    if (!req.session.loggedin) {
        return res.redirect('/login');
    }
    const pqrssi_id = req.params.pqrssi_id;

    db.query(`
        SELECT h.id, h.fecha, e.nombre AS estado, h.comentario
        FROM historial h
        JOIN estados e ON h.estado_id = e.id
        WHERE h.pqrssi_id = $1
    `, [pqrssi_id], (err, results) => {
        if (err) throw err;
        res.render('historial', { historial: results.rows });
    });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
