set dotenv-load

dockerfile := if env_var("NODE_ENV") == "production" { "docker-compose-prod.yml" } else { "docker-compose.yml" }
commithash := `git rev-parse --short HEAD`
app := ""

GREEN  := "\\u001b[32m"
RESET  := "\\u001b[0m"
CHECK  := `/usr/bin/printf "\xE2\x9C\x94"`

# Lists Recipes
default:
  @echo Environment is $NODE_ENV on commit {{commithash}}
  @just --list


i18np:
    @echo "Parsing translation files"
    @i18next -c 'web/i18next-parser.config.js'

i18nd:
    @echo "Downloading translations"
    @crowdin.bat download --config './crowdin.yml'

i18nu:
    @echo "Uploading translations"
    @crowdin.bat upload translations --auto-approve-imported --config './crowdin.yml'

# Stops all containers
down:
    @docker compose -f {{dockerfile}} down
stop:
    @docker compose -f {{dockerfile}} down

restart:
    @docker compose -f {{dockerfile}} down
    @docker compose -f {{dockerfile}} up -d

# Builds all images
buildall:
    @docker compose -f {{dockerfile}} build --build-arg NODE_ENV=$NODE_ENV --build-arg COMMIT_HASH={{commithash}}
    @echo -e " {{GREEN}}{{CHECK}} Successfully built! {{CHECK}} {{RESET}}"

logs:
    @docker logs {{app}} -f

# Builds one image
build:
    @echo -e "Running for {{app}} on {{dockerfile}} with {{commithash}}"
    git pull
    @docker compose -f {{dockerfile}} build --build-arg NODE_ENV=$NODE_ENV --build-arg COMMIT_HASH={{commithash}} {{app}}
    @echo -e " {{GREEN}}{{CHECK}} Successfully built! {{CHECK}} {{RESET}}"
    @docker compose -f {{dockerfile}} up -d {{app}}
    @echo -e " {{GREEN}}{{CHECK}} Successfully ran! {{CHECK}} {{RESET}}"

# Starts images
up:
    @echo "Starting server with database $NODE_ENV at {{dockerfile}}"
    @docker compose -f {{dockerfile}} up -d

update:
    git pull
    @docker compose -f {{dockerfile}} build --build-arg NODE_ENV=$NODE_ENV --build-arg COMMIT_HASH={{commithash}}
    @echo -e " {{GREEN}}{{CHECK}} Successfully built! {{CHECK}} {{RESET}}"
    @docker compose -f {{dockerfile}} up -d

pullall:
    cd ./web && yarn pullpsql && yarn generateprisma
    cd ./twitch-eventsub-listener && yarn pullpsql && yarn generateprisma
    cd ./twitch-chat-listener && yarn pullpsql && yarn generateprisma
