# Serves the web editor (docs/ only, so submitted-tests/ never enters the image).
# Coolify: add the repo as an application, pick "Dockerfile" as the build pack,
# set the port to 80. Nothing else to configure.
FROM nginx:alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY docs/ /usr/share/nginx/html/

EXPOSE 80
