# 1. Empezar con una caja que ya es un servidor Nginx (un "camarero")
FROM nginx:1.25-alpine

# 2. Ir a la carpeta donde el camarero sirve las páginas
WORKDIR /usr/share/nginx/html

# 3. Borrar la página de bienvenida que trae el camarero por defecto
RUN rm ./*

# 4. Copiar tu salón (index.html) a esa carpeta
COPY index.html .

# ¡Eso es todo! Nginx sabe automáticamente cómo servir archivos
# y usa el puerto 80 por defecto.