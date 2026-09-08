// 图标生成器：从仓库现有鲸鱼 SVG 路径生成统一的方形主素材，以及各平台资源。
package main

import (
	"bytes"
	"encoding/binary"
	"encoding/xml"
	"flag"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/jackmordaunt/icns/v2"
	"golang.org/x/image/vector"
)

const (
	canvasSize = 1024

	// 50x50 的原始鲸鱼路径经过这组变换后，光学包围盒约为画布宽度的 73%、
	// 高度的 55%。所有平台都直接复用这组坐标，不再让 favicon 单独放大鲸鱼。
	whaleOffset = 128
	whaleScale  = 15.36

	// macOS Dock 中不同应用的系统留白差异明显；给 macOS 单独保留 10% 的透明
	// 边距，避免应用图标的视觉重量大于 Dock 中的其他图标。鲸鱼本身仍是同一几何。
	macIconScale = 0.90

	iconName = "deepseek-harness-desktop"
)

var (
	icoSizes   = []int{256, 128, 64, 48, 32, 24, 16}
	linuxSizes = []int{16, 24, 32, 48, 64, 128, 256, 512}
)

type pathToken struct {
	command byte
	number  float32
}

func main() {
	sourceSVG := flag.String("source-svg", "assets/dsh-app-icon.svg", "读取鲸鱼路径的统一主素材 SVG")
	appSVG := flag.String("app-svg", "assets/dsh-app-icon.svg", "统一主素材 SVG 输出路径")
	appPNG := flag.String("app-png", "assets/dsh-app-icon.png", "统一主素材 PNG 输出路径")
	macPNG := flag.String("mac-png", "assets/dsh-app-icon-macos.png", "macOS 额外留白 PNG 输出路径")
	compatSVG := flag.String("compat-svg", "assets/dsh-favicon.svg", "旧 favicon SVG 兼容输出路径")
	compatPNG := flag.String("compat-png", "assets/dsh-favicon.png", "旧 favicon PNG 兼容输出路径")
	buildPNG := flag.String("build-png", "build/appicon.png", "Wails 构建输入 PNG 输出路径")
	windowsICO := flag.String("windows-ico", "build/windows/icon.ico", "Windows ICO 输出路径")
	linuxRoot := flag.String("linux-root", "build/linux/icons", "Linux hicolor 图标根目录")
	darwinICNS := flag.String("darwin-icns", "build/darwin/icons.icns", "macOS ICNS 输出路径")
	flag.Parse()

	source, err := os.ReadFile(*sourceSVG)
	if err != nil {
		fatalf("读取 SVG 失败: %v", err)
	}
	pathData, err := extractPathData(string(source))
	if err != nil {
		fatalf("读取鲸鱼路径失败: %v", err)
	}
	tokens, err := tokenizePath(pathData)
	if err != nil {
		fatalf("解析鲸鱼路径失败: %v", err)
	}

	masterSVG := buildSVG(pathData)
	masterPNG, err := encodePNG(renderIcon(canvasSize, tokens, 1))
	if err != nil {
		fatalf("生成主 PNG 失败: %v", err)
	}
	for _, output := range []string{*appSVG, *compatSVG} {
		if err := writeBytes(output, masterSVG); err != nil {
			fatalf("写入 SVG %s 失败: %v", output, err)
		}
	}
	for _, output := range []string{*appPNG, *compatPNG, *buildPNG} {
		if err := writeBytes(output, masterPNG); err != nil {
			fatalf("写入 PNG %s 失败: %v", output, err)
		}
	}
	macIcon, err := encodePNG(renderIcon(canvasSize, tokens, macIconScale))
	if err != nil {
		fatalf("生成 macOS PNG 失败: %v", err)
	}
	if err := writeBytes(*macPNG, macIcon); err != nil {
		fatalf("写入 macOS PNG %s 失败: %v", *macPNG, err)
	}

	if err := writeICO(*windowsICO, tokens); err != nil {
		fatalf("生成 Windows ICO 失败: %v", err)
	}
	if err := writeLinuxIcons(*linuxRoot, masterSVG, tokens); err != nil {
		fatalf("生成 Linux 图标失败: %v", err)
	}
	if err := writeDarwinICNS(*darwinICNS, tokens); err != nil {
		fatalf("生成 macOS ICNS 失败: %v", err)
	}

	fmt.Printf("已生成统一图标：SVG、PNG、ICO，以及 Linux %d 个尺寸的 PNG\n", len(linuxSizes))
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}

func extractPathData(source string) (string, error) {
	start := strings.Index(source, ` d="`)
	if start < 0 {
		return "", fmt.Errorf("未找到 d 属性")
	}
	start += len(` d="`)
	end := strings.IndexByte(source[start:], '"')
	if end < 0 {
		return "", fmt.Errorf("d 属性未闭合")
	}
	return source[start : start+end], nil
}

func tokenizePath(pathData string) ([]pathToken, error) {
	var tokens []pathToken
	for i := 0; i < len(pathData); {
		c := pathData[i]
		switch {
		case c == 'M' || c == 'C' || c == 'Z':
			tokens = append(tokens, pathToken{command: c})
			i++
		case c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == ',':
			i++
		case c == '-' || c == '+' || c == '.' || (c >= '0' && c <= '9'):
			start := i
			i++
			for i < len(pathData) {
				n := pathData[i]
				if (n >= '0' && n <= '9') || n == '.' || n == 'e' || n == 'E' || n == '+' || n == '-' {
					i++
					continue
				}
				break
			}
			number, err := strconv.ParseFloat(pathData[start:i], 32)
			if err != nil {
				return nil, fmt.Errorf("数字 %q 无效: %w", pathData[start:i], err)
			}
			tokens = append(tokens, pathToken{number: float32(number)})
		default:
			return nil, fmt.Errorf("不支持的路径字符 %q", c)
		}
	}
	return tokens, nil
}

func buildSVG(pathData string) []byte {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" fill="none">
  <title>Deepseek Harness Desktop</title>
  <rect id="background" x="48" y="48" width="928" height="928" rx="192" fill="#F5F9FF"/>
  <g transform="translate(128 128) scale(15.36)">
    <path id="whale" d="`)
	_ = xml.EscapeText(&b, []byte(pathData))
	b.WriteString(`" fill="#111318" fill-rule="nonzero"/>
  </g>
</svg>
`)
	return []byte(b.String())
}

func renderIcon(size int, tokens []pathToken, artworkScale float32) *image.RGBA {
	canvas := image.NewRGBA(image.Rect(0, 0, size, size))
	scale := float32(size) / canvasSize * artworkScale

	offset := float32(size) * (1 - artworkScale) / 2
	coordinate := func(value float32) float32 {
		return offset + scale*value
	}

	drawRoundedRect(canvas, coordinate(48), coordinate(48), scale*928, scale*928, scale*192, color.RGBA{R: 245, G: 249, B: 255, A: 255})
	drawWhale(canvas, tokens, scale, offset)
	return canvas
}

func drawRoundedRect(canvas *image.RGBA, x, y, width, height, radius float32, fill color.RGBA) {
	rasterizer := vector.NewRasterizer(canvas.Bounds().Dx(), canvas.Bounds().Dy())
	const kappa float32 = 0.5522847498

	rasterizer.MoveTo(x+radius, y)
	rasterizer.LineTo(x+width-radius, y)
	rasterizer.CubeTo(x+width-radius+kappa*radius, y, x+width, y+radius-kappa*radius, x+width, y+radius)
	rasterizer.LineTo(x+width, y+height-radius)
	rasterizer.CubeTo(x+width, y+height-radius+kappa*radius, x+width-radius+kappa*radius, y+height, x+width-radius, y+height)
	rasterizer.LineTo(x+radius, y+height)
	rasterizer.CubeTo(x+radius-kappa*radius, y+height, x, y+height-radius+kappa*radius, x, y+height-radius)
	rasterizer.LineTo(x, y+radius)
	rasterizer.CubeTo(x, y+radius-kappa*radius, x+radius-kappa*radius, y, x+radius, y)
	rasterizer.ClosePath()
	rasterizer.Draw(canvas, canvas.Bounds(), image.NewUniform(fill), image.Point{})
}

func drawWhale(canvas *image.RGBA, tokens []pathToken, factor, offset float32) {
	rasterizer := vector.NewRasterizer(canvas.Bounds().Dx(), canvas.Bounds().Dy())
	readNumber := func(index *int) (float32, bool) {
		if *index >= len(tokens) || tokens[*index].command != 0 {
			return 0, false
		}
		number := tokens[*index].number
		*index++
		return number, true
	}
	transform := func(value float32, pathOffset float32) float32 {
		return offset + factor*(pathOffset+value*whaleScale)
	}

	var command byte
	index := 0
	for index < len(tokens) {
		if tokens[index].command != 0 {
			command = tokens[index].command
			index++
		}
		switch command {
		case 'M':
			x, okX := readNumber(&index)
			y, okY := readNumber(&index)
			if !okX || !okY {
				return
			}
			rasterizer.MoveTo(transform(x, whaleOffset), transform(y, whaleOffset))
			command = 0
		case 'C':
			values := [6]float32{}
			for i := range values {
				var ok bool
				values[i], ok = readNumber(&index)
				if !ok {
					return
				}
			}
			rasterizer.CubeTo(
				transform(values[0], whaleOffset), transform(values[1], whaleOffset),
				transform(values[2], whaleOffset), transform(values[3], whaleOffset),
				transform(values[4], whaleOffset), transform(values[5], whaleOffset),
			)
		case 'Z':
			rasterizer.ClosePath()
			command = 0
		default:
			return
		}
	}
	rasterizer.Draw(canvas, canvas.Bounds(), image.NewUniform(color.RGBA{R: 17, G: 19, B: 24, A: 255}), image.Point{})
}

func encodePNG(img image.Image) ([]byte, error) {
	var b bytes.Buffer
	if err := png.Encode(&b, img); err != nil {
		return nil, err
	}
	return b.Bytes(), nil
}

func writeBytes(name string, data []byte) error {
	if dir := filepath.Dir(name); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	return os.WriteFile(name, data, 0o644)
}

func writeICO(name string, tokens []pathToken) error {
	pngs := make([][]byte, 0, len(icoSizes))
	for _, size := range icoSizes {
		data, err := encodePNG(renderIcon(size, tokens, 1))
		if err != nil {
			return err
		}
		pngs = append(pngs, data)
	}

	headerSize := 6 + 16*len(pngs)
	totalSize := headerSize
	for _, data := range pngs {
		totalSize += len(data)
	}
	ico := make([]byte, totalSize)
	binary.LittleEndian.PutUint16(ico[0:2], 0)
	binary.LittleEndian.PutUint16(ico[2:4], 1)
	binary.LittleEndian.PutUint16(ico[4:6], uint16(len(pngs)))
	offset := headerSize
	for i, size := range icoSizes {
		entry := 6 + 16*i
		if size < 256 {
			ico[entry] = byte(size)
		}
		if size < 256 {
			ico[entry+1] = byte(size)
		}
		binary.LittleEndian.PutUint16(ico[entry+4:entry+6], 1)
		binary.LittleEndian.PutUint16(ico[entry+6:entry+8], 32)
		binary.LittleEndian.PutUint32(ico[entry+8:entry+12], uint32(len(pngs[i])))
		binary.LittleEndian.PutUint32(ico[entry+12:entry+16], uint32(offset))
		copy(ico[offset:], pngs[i])
		offset += len(pngs[i])
	}
	return writeBytes(name, ico)
}

func writeLinuxIcons(root string, svg []byte, tokens []pathToken) error {
	svgPath := filepath.Join(root, "hicolor", "scalable", "apps", iconName+".svg")
	if err := writeBytes(svgPath, svg); err != nil {
		return err
	}
	for _, size := range linuxSizes {
		pngData, err := encodePNG(renderIcon(size, tokens, 1))
		if err != nil {
			return err
		}
		pngPath := filepath.Join(root, "hicolor", fmt.Sprintf("%dx%d", size, size), "apps", iconName+".png")
		if err := writeBytes(pngPath, pngData); err != nil {
			return err
		}
	}
	return nil
}

func writeDarwinICNS(name string, tokens []pathToken) error {
	iconImage := renderIcon(canvasSize, tokens, macIconScale)
	if dir := filepath.Dir(name); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	file, err := os.Create(name)
	if err != nil {
		return err
	}
	defer file.Close()
	return icns.Encode(file, iconImage)
}
