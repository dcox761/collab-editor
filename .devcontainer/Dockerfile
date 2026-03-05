FROM public.ecr.aws/lts/ubuntu:latest

ENV TERM=linux
ENV DEBIAN_FRONTEND=noninteractive
#ENV CLEAR_CACHE=230516

WORKDIR /tmp

RUN \
  apt-get update && \
  apt-get upgrade -y && \
  apt-get install -y wget curl net-tools unzip dnsutils ldap-utils telnet && \
  apt-get install -y gpg jq parallel graphviz git vim nano
  
# AWS CLI v2
# https://docs.aws.amazon.com/codecommit/latest/userguide/setting-up-git-remote-codecommit.html
# RUN \
#   apt-get install -y awscli

RUN \
  curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && \
  unzip awscliv2.zip && \
  ./aws/install && \
  aws --version && \
  aws configure set region ap-southeast-2

# uv for Python
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
RUN echo 'export PATH="$PATH:~/.local/bin"' >> ~/.bashrc
# Python 3.11 required for git-remote-codecommit
# https://pypi.org/project/git-remote-codecommit/
ENV PATH="/root/.local/bin:${PATH}"
RUN uv python install 3.11
RUN uv venv --python 3.11 ~/venv
ENV VIRTUAL_ENV="/root/venv"
ENV PATH="${VIRTUAL_ENV}/bin:${PATH}"
RUN echo "source ~/venv/bin/activate" >> ~/.bashrc

RUN \
  apt clean


# not available without systemd
#RUN timedatectl set-timezone Australia/Adelaide
RUN ln -sf /usr/share/zoneinfo/Australia/Adelaide  /etc/localtime

# Docker
RUN mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
RUN CODENAME=$(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") && \
    { \
        echo 'Types: deb'; \
        echo 'URIs: https://download.docker.com/linux/ubuntu'; \
        echo "Suites: $CODENAME"; \
        echo 'Components: stable'; \
        echo 'Signed-By: /etc/apt/keyrings/docker.asc'; \
    } > /etc/apt/sources.list.d/docker.sources
RUN apt-get update && apt-get install -y docker-ce-cli docker-compose-plugin

CMD ["bash" ]
