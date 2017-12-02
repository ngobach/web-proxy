import http from 'http';
import request from 'request';
import liburl from 'url';
import chalk from 'chalk';
import cheerio from 'cheerio';

const {
  PORT = 5000,
} = process.env;

const pathRegex = /^\/https?:\/\/(?=[a-zA-Z0-9-]+\.)[a-zA-Z0-9]+/;

const srv = http.createServer((req, res) => {
  try {
    let url;
    if (pathRegex.test(req.url)) {
      url = req.url.slice(1);
    } else if (req.headers.referer) {
      res.end(req.headers.referer);
      return;
    } else {
      res.end('Failed :(');
      return;
    }

    console.log(`${chalk.magenta('Proxying to:')} ${url}`);
    const headers = Object.assign({}, req.headers);
    headers.origin = (() => {
      const parsedUrl = liburl.parse(url);
      return liburl.format({
        protocol: parsedUrl.protocol,
        host: parsedUrl.host,
        path: '/',
      });
    })();
    delete headers.host;

    const transformUrl = target => `/${liburl.resolve(url, target)}`;

    request({
      url,
      headers,
      method: req.method,
      body: req,
      followRedirect: false,
      gzip: true,
      encoding: null,
    }, (err, cRes, resBody) => {
      if (err) {
        console.error(err);
        res.end('Err');
        return;
      }

      res.statusCode = cRes.statusCode;
      res.statusMessage = cRes.statusMessage;
      let body = '';
      Object.keys(cRes.headers).forEach((key) => {
        // Ignored headers
        if (['content-encoding', 'content-length', 'content-security-policy'].indexOf(key) >= 0) {
          return;
        } else if (key === 'location') {
          res.setHeader(key, transformUrl(cRes.headers[key]));
          return;
        }
        res.setHeader(key, cRes.headers[key]);
      });
      if (typeof cRes.headers['content-type'] === 'string' && cRes.headers['content-type'].startsWith('text/')) {
        if (cRes.headers['content-type'].startsWith('text/html')) {
          const $ = cheerio.load(resBody.toString('utf8'));
          ['href', 'src', 'action'].forEach((prop) => {
            $(`[${prop}]`).each((i, e) => {
              $(e).attr(prop, transformUrl($(e).attr(prop)));
            });
          });
          $('[integrity]').each((i, e) => {
            $(e).removeAttr('integrity');
          });
          body = $.html();
        // } else if (cRes.headers['content-type'].startsWith('text/javasript')) {
        //   body = resBody;
        } else {
          body = resBody;
        }
      } else {
        body = resBody;
      }
      res.end(body);
    });
  } catch (err) {
    console.error(err);
    res.end('Err');
  }
});

srv.listen(PORT, () => {
  console.log(`Server is listening at: ${chalk.red(srv.address().port)}`);
});
