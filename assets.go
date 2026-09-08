package main

import "embed"

//go:embed assets/*
var assets embed.FS

var appIcon = mustAsset("assets/dsh-app-icon.png")

func mustAsset(name string) []byte {
	data, err := assets.ReadFile(name)
	if err != nil {
		panic(err)
	}
	return data
}
