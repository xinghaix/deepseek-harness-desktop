package main

import (
	"embed"
	"runtime"
)

//go:embed assets/*
var assets embed.FS

var appIcon = func() []byte {
	if runtime.GOOS == "darwin" {
		return mustAsset("assets/dsh-app-icon-macos.png")
	}
	return mustAsset("assets/dsh-app-icon.png")
}()

func mustAsset(name string) []byte {
	data, err := assets.ReadFile(name)
	if err != nil {
		panic(err)
	}
	return data
}
