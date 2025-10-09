import dotenv from "dotenv";
dotenv.config();

const config = {
  connectionString: `Driver={ODBC Driver 17 for SQL Server};Server=${process.env.SERVER};Database=${process.env.DATABASE};Uid=${process.env.USER};Pwd=${process.env.PASSWORD};Trusted_Connection=No;`,
};

export default config;
