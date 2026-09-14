# GNU Make entry for Deepseek Harness Desktop (replaces Taskfile.yml).
# Prefer: make build / make test. CI may still call scripts/build.sh directly.
# Requires GNU Make (macOS ships /usr/bin/make 3.81+).

.DEFAULT_GOAL := help

.PHONY: help icons test build linux-build darwin-build windows-build clean

DIST ?= dist
APP ?= deepseek-harness-desktop
BUNDLE_NAME ?= Deepseek Harness Desktop
GOOS ?= $(shell go env GOOS)
GOARCH ?= $(shell go env GOARCH)
VERSION ?=
EXTRA_TAGS ?=
BUILD_TAGS ?= $(if $(EXTRA_TAGS),wails$(comma)$(EXTRA_TAGS),wails)
comma := ,

export DIST APP BUNDLE_NAME GOOS GOARCH BUILD_TAGS
ifneq ($(strip $(VERSION)),)
export VERSION
endif

help:
	@echo "Targets:"
	@echo "  make icons                 Regenerate committed icon assets (not part of build)"
	@echo "  make test                  Race tests (default + -tags wails)"
	@echo "  make build [VERSION=...]   Build for GOOS/GOARCH (default: host)"
	@echo "  make linux-build           Build Linux binary (GOARCH=$(GOARCH))"
	@echo "  make darwin-build          Build macOS .app + DMG"
	@echo "  make windows-build         Build Windows .exe"
	@echo "  make clean                 Remove $(DIST)/"
	@echo ""
	@echo "Vars: VERSION EXTRA_TAGS BUILD_TAGS GOOS GOARCH DIST"
	@echo "Taskfile mapping: task build → make build; task linux:build → make linux-build (etc.)"

icons:
	go run ./tools/icons

test:
	go test -race ./...
	go test -race -tags wails ./...

build:
	@VERSION="$(VERSION)" BUILD_TAGS="$(BUILD_TAGS)" GOOS="$(GOOS)" GOARCH="$(GOARCH)" DIST="$(DIST)" \
		sh scripts/build.sh $(VERSION)

linux-build:
	@$(MAKE) build GOOS=linux GOARCH="$(GOARCH)" VERSION="$(VERSION)" EXTRA_TAGS="$(EXTRA_TAGS)" BUILD_TAGS="$(BUILD_TAGS)" DIST="$(DIST)"

darwin-build:
	@$(MAKE) build GOOS=darwin GOARCH="$(GOARCH)" VERSION="$(VERSION)" EXTRA_TAGS="$(EXTRA_TAGS)" BUILD_TAGS="$(BUILD_TAGS)" DIST="$(DIST)"

windows-build:
	@$(MAKE) build GOOS=windows GOARCH="$(GOARCH)" VERSION="$(VERSION)" EXTRA_TAGS="$(EXTRA_TAGS)" BUILD_TAGS="$(BUILD_TAGS)" DIST="$(DIST)"

clean:
	rm -rf "$(DIST)"
