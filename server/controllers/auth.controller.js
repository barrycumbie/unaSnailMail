exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (email === "test@test.com" && password === "1234") {
      return res.json({ token: "fake-jwt-token" });
    }

    res.status(401).json({ message: "Invalid credentials" });
  } catch (err) {
    next(err);
  }
};

exports.register = async (req, res, next) => {
  try {
    res.json({ message: "Register route placeholder" });
  } catch (err) {
    next(err);
  }
};
