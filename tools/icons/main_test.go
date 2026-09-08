package main

import (
	"encoding/binary"
	"image"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func sourceTokens(t *testing.T) []pathToken {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "assets", "dsh-app-icon.svg"))
	if err != nil {
		t.Fatal(err)
	}
	pathData, err := extractPathData(string(data))
	if err != nil {
		t.Fatal(err)
	}
	tokens, err := tokenizePath(pathData)
	if err != nil {
		t.Fatal(err)
	}
	return tokens
}

func TestWhaleOpticalBoundingBox(t *testing.T) {
	img := renderIcon(canvasSize, sourceTokens(t), 1)
	minX, minY := img.Bounds().Max.X, img.Bounds().Max.Y
	maxX, maxY := -1, -1
	for y := img.Bounds().Min.Y; y < img.Bounds().Max.Y; y++ {
		for x := img.Bounds().Min.X; x < img.Bounds().Max.X; x++ {
			pixel := img.RGBAAt(x, y)
			if pixel.A > 200 && pixel.R < 40 && pixel.G < 40 && pixel.B < 40 {
				if x < minX {
					minX = x
				}
				if y < minY {
					minY = y
				}
				if x > maxX {
					maxX = x
				}
				if y > maxY {
					maxY = y
				}
			}
		}
	}
	if maxX < 0 {
		t.Fatal("没有渲染出鲸鱼路径")
	}
	box := image.Rect(minX, minY, maxX+1, maxY+1)
	if box.Dx() < 730 || box.Dx() > 760 || box.Dy() < 540 || box.Dy() > 575 {
		t.Fatalf("鲸鱼 optical bounding box = %v，超出统一比例", box)
	}
	centerX := float64(box.Min.X+box.Max.X-1) / 2
	centerY := float64(box.Min.Y+box.Max.Y-1) / 2
	if centerX < 507 || centerX > 517 || centerY < 507 || centerY > 517 {
		t.Fatalf("鲸鱼 optical bounding box 中心 = (%.1f, %.1f)，没有对齐画布中心", centerX, centerY)
	}
}

func TestMasterSVGHasNoBorder(t *testing.T) {
	svg := string(buildSVG("M0 0Z"))
	if strings.Count(svg, "<rect") != 1 || strings.Contains(svg, "#092C6B") || strings.Contains(svg, "stroke=") {
		t.Fatalf("主 SVG 仍包含 border 图层: %s", svg)
	}
}

func TestMacIconUsesAdditionalTransparentPadding(t *testing.T) {
	tokens := sourceTokens(t)
	master := alphaBounds(renderIcon(canvasSize, tokens, 1))
	mac := alphaBounds(renderIcon(canvasSize, tokens, macIconScale))
	if master.Dx() < 920 || mac.Dx() < 820 || mac.Dx() > 850 || mac.Dx() >= master.Dx() {
		t.Fatalf("macOS 图标留白不足：主素材=%v，macOS=%v", master, mac)
	}
	if master.Dy() != master.Dx() || mac.Dy() != mac.Dx() {
		t.Fatalf("图标透明边界不是方形：主素材=%v，macOS=%v", master, mac)
	}
}

func alphaBounds(img *image.RGBA) image.Rectangle {
	minX, minY := img.Bounds().Max.X, img.Bounds().Max.Y
	maxX, maxY := -1, -1
	for y := img.Bounds().Min.Y; y < img.Bounds().Max.Y; y++ {
		for x := img.Bounds().Min.X; x < img.Bounds().Max.X; x++ {
			if img.RGBAAt(x, y).A == 0 {
				continue
			}
			if x < minX {
				minX = x
			}
			if y < minY {
				minY = y
			}
			if x > maxX {
				maxX = x
			}
			if y > maxY {
				maxY = y
			}
		}
	}
	if maxX < 0 {
		return image.Rectangle{}
	}
	return image.Rect(minX, minY, maxX+1, maxY+1)
}

func TestWriteICOContainsAllWindowsSizes(t *testing.T) {
	path := filepath.Join(t.TempDir(), "icon.ico")
	if err := writeICO(path, sourceTokens(t)); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) < 6 || binary.LittleEndian.Uint16(data[2:4]) != 1 || int(binary.LittleEndian.Uint16(data[4:6])) != len(icoSizes) {
		t.Fatalf("ICO 头部无效，长度=%d", len(data))
	}
	for index, size := range icoSizes {
		entry := 6 + 16*index
		width := int(data[entry])
		if width == 0 {
			width = 256
		}
		height := int(data[entry+1])
		if height == 0 {
			height = 256
		}
		if width != size || height != size {
			t.Fatalf("ICO 第 %d 项尺寸 = %dx%d，期望 %dx%d", index, width, height, size, size)
		}
		offset := int(binary.LittleEndian.Uint32(data[entry+12 : entry+16]))
		length := int(binary.LittleEndian.Uint32(data[entry+8 : entry+12]))
		if offset < 0 || length < 8 || offset+length > len(data) || string(data[offset:offset+8]) != "\x89PNG\r\n\x1a\n" {
			t.Fatalf("ICO 第 %d 项不是有效 PNG 数据", index)
		}
	}
}

func TestWriteICNSHasValidContainer(t *testing.T) {
	path := filepath.Join(t.TempDir(), "icons.icns")
	if err := writeDarwinICNS(path, sourceTokens(t)); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) < 8 || string(data[:4]) != "icns" || int(binary.BigEndian.Uint32(data[4:8])) != len(data) {
		t.Fatalf("ICNS 容器头部无效，长度=%d", len(data))
	}
}
