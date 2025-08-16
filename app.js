require('dotenv').config();
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');


var domainsRouter = require('./routes/domains');
var emailsRouter = require('./routes/emails');
var contactsRouter = require('./routes/contacts');
var audiencesRouter = require('./routes/audiences');
var broadcastsRouter = require('./routes/broadcasts');
var mailboxRouter = require('./routes/mailboxRouter');
var { specs, swaggerUi } = require('./swagger');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));

// Skip JSON parsing for webhook routes to preserve raw body for signature verification
app.use((req, res, next) => {
  if (req.path === '/emails/webhook') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: "5mb" }));

app.use('/domains', domainsRouter);
app.use('/emails', emailsRouter);
app.use('/contacts', contactsRouter);
app.use('/audiences', audiencesRouter);
app.use('/broadcasts', broadcastsRouter);
app.use('/mailbox', mailboxRouter);

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});


// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
