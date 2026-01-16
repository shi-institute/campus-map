This repository provides the frontend and backend for the campus map.
ALl operations run inside a Docker container.

BUILD

docker build -t campus-map-server:latest .

SAVE

docker save -o campus-map-server-latest.tar campus-map-server:latest

RUN SERVER

```
docker run -it --rm --user $(id -u):$(id -g) -p 3000:3000 --env-file "$(pwd)/.env" campus-map-server:latest bash -lc 'npm run start'
```

RUN INTERACTIVE (BASH)

If you are using Visual Studio Code on linux, the default terminal will automatically run the container in this mode. You do not need to run the `docker run` command below manually.

```
docker run -dit --rm --user $(id -u):$(id -g) \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$(pwd)/server:/app/server" \
    -v "$(pwd)/client:/app/client" \
    --env-file "$(pwd)/.env" \
    -p 3000:3000 \
    -p 24678:24678 \
    --name campus-map-server \
    campus-map-server:latest
```

Then run `npm run dev` inside the container.

REQUIRED ENVIRONMENT VARIABLES

```
DATA_REPOSITORY=jackbuehner/kart-test
DOMAIN_USERNAME=username@fu.campus
DOMAIN_PASSWORD=password
JWT_SECRET=default_jwt_secret
SESSION_SECRET=default_session_secret
```

Change the DOMAIN_USERNAME and DOMAIN_PASSWORD to valid Active Directory credentials for authentication to work.

Use actual secrets for JWT_SECRET and SESSION_SECRET in production.
