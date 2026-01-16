FROM ghcr.io/osgeo/gdal:ubuntu-small-latest

ENV PGDATA=/var/lib/postgresql/data
ENV POSTGRES_USER=campusmap
ENV POSTGRES_PASSWORD=password
ENV DATA_DB=kart
ENV ROUTING_DB=routing

# install postgres and pgrouting
RUN apt-get update && \
    apt-get install -y postgresql-common && \
    /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y && \
    apt-get install -y postgresql-18 postgresql-18-pgrouting postgresql-18-postgis-3 && \
    apt-get clean

# install curl and other dependencies build-related tools
RUN apt-get update && \
    apt-get install -y curl ca-certificates gnupg lsb-release unzip sudo git gcc g++ make libsqlite3-dev zlib1g-dev && \
    apt-get clean

# download and install kart
RUN curl -L -o kart-0.17.0-1.x86_64.deb https://github.com/koordinates/kart/releases/download/v0.17.0/kart_0.17.0_amd64.deb && \
    apt-get install -y ./kart-0.17.0-1.x86_64.deb && \
    rm kart-0.17.0-1.x86_64.deb && \
    apt-get clean

# download and install node.js version 24
ENV FNM_DIR="/usr/local/share/fnm"
RUN curl -fsSL https://fnm.vercel.app/install | bash -s -- --install-dir ${FNM_DIR} --skip-shell
RUN ${FNM_DIR}/fnm install 24 && ${FNM_DIR}/fnm default 24
RUN chown -R root:root /usr/local/share/fnm && chmod -R u=rwx,go=rx /usr/local/share/fnm

# build and install tippecanoe
RUN git clone --depth=1 https://github.com/felt/tippecanoe.git && \
    cd tippecanoe && \
    make -j && \
    make install && \
    cd .. && \
    rm -rf tippecanoe

# install miniforge (conda)
ENV CONDA_DIR=/opt/miniforge3
RUN curl -L -O "https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-$(uname)-$(uname -m).sh"
RUN bash Miniforge3-$(uname)-$(uname -m).sh -b -p ${CONDA_DIR}
RUN rm Miniforge3-$(uname)-$(uname -m).sh

# create shared global condarc
RUN mkdir -p /etc/conda && \
    cat > /etc/conda/.condarc <<'EOF'
envs_dirs:
  - ~/.conda/envs
  - /opt/miniforge3/envs
pkgs_dirs:
  - ~/.conda/pkgs
  - /opt/miniforge3/pkgs
EOF

# install conda environment
COPY ./server/src/utils/convertWaysToEdges/environment.yaml ./convert-ways-to-edges.environment.yaml
RUN $CONDA_DIR/bin/conda env create -f ./convert-ways-to-edges.environment.yaml -p $CONDA_DIR/envs/convert-ways-to-edges

# create the postgres data directory
RUN mkdir -p $PGDATA && chown postgres:postgres $PGDATA
RUN sudo -u postgres /usr/lib/postgresql/18/bin/initdb -D $PGDATA

# create user and databases
RUN sudo -u postgres /usr/lib/postgresql/18/bin/pg_ctl -D $PGDATA -o "-c listen_addresses=''" -w start \
    && sudo -u postgres /usr/lib/postgresql/18/bin/psql -U postgres -c "CREATE USER ${POSTGRES_USER} PASSWORD '${POSTGRES_PASSWORD}';" \
    && sudo -u postgres /usr/lib/postgresql/18/bin/psql -U postgres -c "CREATE DATABASE ${DATA_DB} OWNER ${POSTGRES_USER};" \
    && sudo -u postgres /usr/lib/postgresql/18/bin/psql -U postgres -d ${DATA_DB} -c "CREATE EXTENSION postgis;" \
    && sudo -u postgres /usr/lib/postgresql/18/bin/psql -U postgres -c "CREATE DATABASE ${ROUTING_DB} OWNER ${POSTGRES_USER};" \
    && sudo -u postgres /usr/lib/postgresql/18/bin/psql -U postgres -d ${ROUTING_DB} -c "CREATE EXTENSION postgis;" \
    && sudo -u postgres /usr/lib/postgresql/18/bin/psql -U postgres -d ${ROUTING_DB} -c "CREATE EXTENSION pgRouting;" \
    && sudo -u postgres /usr/lib/postgresql/18/bin/pg_ctl -D $PGDATA -m fast stop

# copy over client application files
WORKDIR /app/client
COPY ./client/ ./
RUN chown -R 1000:1000 /app/client && chmod -R a+rwX /app/client
RUN bash -c 'eval "$(${FNM_DIR}/fnm env)" && npm install'

# copy nodejs server application files
WORKDIR /app/server
COPY ./server/ ./
RUN chown -R 1000:1000 /app/server && chmod -R a+rwX /app/server
RUN bash -c 'eval "$(${FNM_DIR}/fnm env)" && npm install'

# expose port 3000
EXPOSE 3000

# development only: expose postgres port and allow external connections
EXPOSE 5432
RUN sed -ri "s/^#?listen_addresses\s*=.*/listen_addresses = '*'/" $PGDATA/postgresql.conf
RUN echo "host all all 0.0.0.0/0 trust" >> $PGDATA/pg_hba.conf
RUN echo "host all all 0.0.0.0/0 md5" >> $PGDATA/pg_hba.conf

# never require a password for sudo
RUN echo "ALL ALL=(ALL:ALL) NOPASSWD:ALL" > /etc/sudoers.d/nopasswd && \
    chmod 440 /etc/sudoers.d/nopasswd

# set up environment for login and bash shells
RUN cat <<'EOF' > /etc/profile.d/env-common.sh
# add fnm and conda to path and initialize them
export PATH=$PATH:${FNM_DIR}:${CONDA_DIR}/bin
eval "$(/usr/local/share/fnm/fnm env)"
. ${CONDA_DIR}/etc/profile.d/conda.sh

# configure conda to use shared condarc
export CONDARC=/etc/conda/.condarc

# unset environment variables that are not UTF-8 (crashes kart otherwise)
/usr/local/bin/unset-nonutf8.sh 2>/dev/null || true
EOF
RUN cat /etc/profile.d/env-common.sh >> /etc/bash.bashrc

# start the server (tiny forwards signals to postgres and bash)
COPY ./scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY ./scripts/unset-nonutf8.sh /usr/local/bin/unset-nonutf8.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/unset-nonutf8.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
