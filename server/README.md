BUILD:

docker build -t campus-map-server:latest .

RUN INTERACTIVE

docker run -it --rm -p 3000:3000 --env-file .env --name campus-map-server campus-map-server:latest

RUN INTERACTIVE WITH LINKED SOURCE FOLDER

docker run -it --rm \
 -v $(pwd)/src:/app/server/src \
 -v $(pwd)/.env:/app/server/.env \
 -p 3000:3000 \
 --name campus-map-server \
 campus-map-server:latest
