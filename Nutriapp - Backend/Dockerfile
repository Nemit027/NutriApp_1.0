# 1. Empezar con una caja que ya tiene Node.js (versión 18)
FROM node:18-alpine

# 2. Crear una carpeta de trabajo llamada /app dentro de la caja
WORKDIR /usr/src/app

# 3. Copiar la "lista de ingredientes" (tus package.json)
COPY package*.json ./

# 4. Instalar todos los ingredientes DENTRO de la caja.
# (Esto instala express, pg, bcrypt, etc.)
RUN npm install

# 5. Ahora sí, copiar el resto de tu cocina (index.js, db.js)
COPY . .

# 6. Avisar a Docker que tu cocina usa el puerto 5000
# (Tu index.js dice: process.env.PORT || 5000)
EXPOSE 5000

# 7. El comando para "encender" la cocina (usa el script del Paso 1)
CMD [ "npm", "start" ]