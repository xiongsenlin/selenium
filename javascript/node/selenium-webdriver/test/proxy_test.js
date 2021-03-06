// Licensed to the Software Freedom Conservancy (SFC) under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  The SFC licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

'use strict';

var http = require('http'),
    url = require('url');

var Browser = require('..').Browser,
    promise = require('..').promise,
    firefox = require('../firefox'),
    proxy = require('../proxy'),
    assert = require('../testing/assert'),
    test = require('../lib/test'),
    Server = require('../lib/test/httpserver').Server,
    Pages = test.Pages;

test.suite(function(env) {
  function writeResponse(res, body, encoding, contentType) {
    res.writeHead(200, {
      'Content-Length': Buffer.byteLength(body, encoding),
      'Content-Type': contentType
    });
    res.end(body);
  }

  function writePacFile(res) {
    writeResponse(res, [
      'function FindProxyForURL(url, host) {',
      '  if (shExpMatch(url, "' + goodbyeServer.url('*') + '")) {',
      '    return "DIRECT";',
      '  }',
      '  return "PROXY ' + proxyServer.host() + '";',
      '}'
    ].join('\n'), 'ascii', 'application/x-javascript-config');
  }

  var proxyServer = new Server(function(req, res) {
    var pathname = url.parse(req.url).pathname;
    if (pathname === '/proxy.pac') {
      return writePacFile(res);
    }

    writeResponse(res, [
      '<!DOCTYPE html>',
      '<title>Proxy page</title>',
      '<h3>This is the proxy landing page</h3>'
    ].join(''), 'utf8', 'text/html; charset=UTF-8');
  });

  var helloServer = new Server(function(req, res) {
    writeResponse(res, [
      '<!DOCTYPE html>',
      '<title>Hello</title>',
      '<h3>Hello, world!</h3>'
    ].join(''), 'utf8', 'text/html; charset=UTF-8');
  });

  var goodbyeServer = new Server(function(req, res) {
    writeResponse(res, [
      '<!DOCTYPE html>',
      '<title>Goodbye</title>',
      '<h3>Goodbye, world!</h3>'
    ].join(''), 'utf8', 'text/html; charset=UTF-8');
  });

  // Cannot pass start directly to mocha's before, as mocha will interpret the optional
  // port parameter as an async callback parameter.
  function mkStartFunc(server) {
    return function() {
      return server.start();
    };
  }

  before(mkStartFunc(proxyServer));
  before(mkStartFunc(helloServer));
  before(mkStartFunc(goodbyeServer));

  after(proxyServer.stop.bind(proxyServer));
  after(helloServer.stop.bind(helloServer));
  after(goodbyeServer.stop.bind(goodbyeServer));

  var driver;
  beforeEach(function() { driver = null; });
  afterEach(function() { return driver && driver.quit(); });

  function createDriver(proxy) {
    // For Firefox we need to explicitly enable proxies for localhost by
    // clearing the network.proxy.no_proxies_on preference.
    let profile = new firefox.Profile();
    profile.setPreference('network.proxy.no_proxies_on', '');

    return driver = env.builder()
        .setFirefoxOptions(new firefox.Options().setProfile(profile))
        .setProxy(proxy)
        .build();
  }

  // Proxy support not implemented.
  test.ignore(env.browsers(Browser.IE, Browser.OPERA, Browser.SAFARI)).
  describe('manual proxy settings', function() {
    // phantomjs 1.9.1 in webdriver mode does not appear to respect proxy
    // settings.
    test.ignore(env.browsers(Browser.PHANTOM_JS)).
    it('can configure HTTP proxy host', async function() {
      await createDriver(proxy.manual({
        http: proxyServer.host()
      }));

      await driver.get(helloServer.url());
      await assert(driver.getTitle()).equalTo('Proxy page');
      await assert(driver.findElement({tagName: 'h3'}).getText()).
          equalTo('This is the proxy landing page');
    });

    // PhantomJS does not support bypassing the proxy for individual hosts.
    // geckodriver does not support the bypass option, this must be configured
    // through profile preferences.
    test.ignore(env.browsers(
        Browser.FIREFOX,
        'legacy-' + Browser.FIREFOX,
        Browser.PHANTOM_JS)).
    it('can bypass proxy for specific hosts', async function() {
      await createDriver(proxy.manual({
        http: proxyServer.host(),
        bypass: helloServer.host()
      }));

      await driver.get(helloServer.url());
      await assert(driver.getTitle()).equalTo('Hello');
      await assert(driver.findElement({tagName: 'h3'}).getText()).
          equalTo('Hello, world!');

      await driver.get(goodbyeServer.url());
      await assert(driver.getTitle()).equalTo('Proxy page');
      await assert(driver.findElement({tagName: 'h3'}).getText()).
          equalTo('This is the proxy landing page');
    });

    // TODO: test ftp and https proxies.
  });

  // PhantomJS does not support PAC file proxy configuration.
  // Safari does not support proxies.
  test.ignore(env.browsers(
      Browser.IE, Browser.OPERA, Browser.PHANTOM_JS, Browser.SAFARI)).
  describe('pac proxy settings', function() {
    it('can configure proxy through PAC file', async function() {
      await createDriver(proxy.pac(proxyServer.url('/proxy.pac')));

      await driver.get(helloServer.url());
      await assert(driver.getTitle()).equalTo('Proxy page');
      await assert(driver.findElement({tagName: 'h3'}).getText()).
          equalTo('This is the proxy landing page');

      await driver.get(goodbyeServer.url());
      await assert(driver.getTitle()).equalTo('Goodbye');
      await assert(driver.findElement({tagName: 'h3'}).getText()).
          equalTo('Goodbye, world!');
    });
  });

  // TODO: figure out how to test direct and system proxy settings.
  describe.skip('direct proxy settings', function() {});
  describe.skip('system proxy settings', function() {});
});
