import jwt from 'jsonwebtoken';
import env from '../config/env.js';

const signToken = (userId, role) =>
  jwt.sign({ id: userId, role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });

const verifyToken = (token) => jwt.verify(token, env.jwtSecret);

export { signToken, verifyToken };
