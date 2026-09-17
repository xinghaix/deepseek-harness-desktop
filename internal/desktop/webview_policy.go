//go:build wails

package desktop

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

// validateChatURL is the shared policy for every URL that can be loaded into
// the Chat WebView. The one-time dsh login URL may contain only its token
// query; subsequent URLs must be the exact loopback origin with no query.
func validateChatURL(raw string, allowToken bool) error {
	u, err := url.Parse(raw)
	if err != nil || u == nil {
		return fmt.Errorf("invalid Chat URL")
	}
	if u.Scheme != "http" || u.Hostname() != "127.0.0.1" || u.User != nil || u.Fragment != "" || u.Port() == "" {
		return fmt.Errorf("Chat URL must be an authenticated loopback HTTP URL")
	}
	port, err := strconv.Atoi(u.Port())
	if err != nil || port < 1 || port > 65535 {
		return fmt.Errorf("Chat URL has an invalid loopback port")
	}
	if u.Path != "" && u.Path != "/" {
		return fmt.Errorf("Chat URL has an invalid path")
	}
	if !allowToken && u.RawQuery != "" {
		return fmt.Errorf("Chat URL must not contain a query")
	}
	if allowToken && u.RawQuery != "" {
		values := u.Query()
		if len(values) != 1 || len(values["token"]) != 1 || strings.TrimSpace(values.Get("token")) == "" {
			return fmt.Errorf("Chat login URL has an invalid query")
		}
	}
	return nil
}

func sameHTTPOrigin(a, b string) bool {
	oa, ob := httpOrigin(a), httpOrigin(b)
	return oa != "" && oa == ob
}

func httpOrigin(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "http" || u.Host == "" || u.User != nil {
		return ""
	}
	return u.Scheme + "://" + u.Host
}
