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
ENV PATH="/root/.local/share/fnm:$PATH"
RUN curl -fsSL https://fnm.vercel.app/install | bash
RUN bash -c 'eval "$(fnm env)" && fnm install 24 && fnm default 24 && fnm use 24'

# build and install tippecanoe
RUN git clone --depth=1 https://github.com/felt/tippecanoe.git && \
    cd tippecanoe && \
    make -j && \
    make install && \
    cd .. && \
    rm -rf tippecanoe

# install miniforge (conda)
RUN curl -L -O "https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-$(uname)-$(uname -m).sh"
RUN bash Miniforge3-$(uname)-$(uname -m).sh -b
RUN rm Miniforge3-$(uname)-$(uname -m).sh
ENV PATH="/root/miniforge3/bin:${PATH}"

# install conda environment
COPY ./src/utils/convertWaysToEdges/environment.yaml ./convert-ways-to-edges.environment.yaml
RUN /root/miniforge3/bin/conda env create -f ./convert-ways-to-edges.environment.yaml -n convert-ways-to-edges
# RUN echo "source /root/miniforge3/bin/activate convert-ways-to-edges" >> ~/.bashrc

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

# copy nodejs application files
WORKDIR /app/server
COPY ./package*.json ./
COPY ./patches/ ./patches/
RUN bash -c 'eval "$(fnm env)" && npm install'

# copy over source files
COPY ./src/ ./src/

# expose port 3000
EXPOSE 3000

# development only: expose postgres port and allow external connections
EXPOSE 5432
RUN sed -ri "s/^#?listen_addresses\s*=.*/listen_addresses = '*'/" $PGDATA/postgresql.conf
RUN echo "host all all 0.0.0.0/0 trust" >> $PGDATA/pg_hba.conf
RUN echo "host all all 0.0.0.0/0 md5" >> $PGDATA/pg_hba.conf

# start the server
CMD ["sh", "-c", "sudo -u postgres /usr/lib/postgresql/18/bin/postgres -D \"$PGDATA\" > /dev/null 2>&1 & while ! sudo -u postgres /usr/lib/postgresql/18/bin/pg_isready -q; do sleep 0.2; done; exec /bin/bash"]
